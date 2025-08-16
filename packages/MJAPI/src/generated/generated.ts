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


import { IndustryEntity, AccountTypeEntity, ActivityEntity, ContactRelationshipEntity, ContactEntity, ActivityTypeEntity, RelationshipTypeEntity, AccountEntity, AccountStatusEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Industries
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing industry values` })
export class Industry_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the industry`}) 
    @MaxLength(100)
    IndustryName: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Industries
//****************************************************************************
@InputType()
export class CreateIndustryInput {
    @Field({ nullable: true })
    IndustryName?: string;
}
    

//****************************************************************************
// INPUT TYPE for Industries
//****************************************************************************
@InputType()
export class UpdateIndustryInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    IndustryName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Industries
//****************************************************************************
@ObjectType()
export class RunIndustryViewResult {
    @Field(() => [Industry_])
    Results: Industry_[];

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

@Resolver(Industry_)
export class IndustryResolver extends ResolverBase {
    @Query(() => RunIndustryViewResult)
    async RunIndustryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIndustryViewResult)
    async RunIndustryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIndustryViewResult)
    async RunIndustryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Industries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Industry_, { nullable: true })
    async Industry(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Industry_ | null> {
        this.CheckUserReadPermissions('Industries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwIndustries] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Industries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Industries', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Industry_)
    async CreateIndustry(
        @Arg('input', () => CreateIndustryInput) input: CreateIndustryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Industries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Industry_)
    async UpdateIndustry(
        @Arg('input', () => UpdateIndustryInput) input: UpdateIndustryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Industries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Industry_)
    async DeleteIndustry(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Industries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Types
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing account type values` })
export class AccountType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the account type`}) 
    @MaxLength(100)
    TypeName: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account Types
//****************************************************************************
@InputType()
export class CreateAccountTypeInput {
    @Field({ nullable: true })
    TypeName?: string;
}
    

//****************************************************************************
// INPUT TYPE for Account Types
//****************************************************************************
@InputType()
export class UpdateAccountTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    TypeName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Account Types
//****************************************************************************
@ObjectType()
export class RunAccountTypeViewResult {
    @Field(() => [AccountType_])
    Results: AccountType_[];

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

@Resolver(AccountType_)
export class AccountTypeResolver extends ResolverBase {
    @Query(() => RunAccountTypeViewResult)
    async RunAccountTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountTypeViewResult)
    async RunAccountTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountTypeViewResult)
    async RunAccountTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AccountType_, { nullable: true })
    async AccountType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AccountType_ | null> {
        this.CheckUserReadPermissions('Account Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Account Types', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => AccountType_)
    async CreateAccountType(
        @Arg('input', () => CreateAccountTypeInput) input: CreateAccountTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AccountType_)
    async UpdateAccountType(
        @Arg('input', () => UpdateAccountTypeInput) input: UpdateAccountTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AccountType_)
    async DeleteAccountType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType({ description: `Tracks interactions with contacts and accounts` })
export class Activity_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    AccountID?: number;
        
    @Field(() => Int, {nullable: true}) 
    ContactID?: number;
        
    @Field({description: `Type of activity (Call, Email, Meeting, etc.)`}) 
    @MaxLength(100)
    ActivityType: string;
        
    @Field({description: `Brief description of the activity`}) 
    @MaxLength(400)
    Subject: string;
        
    @Field({nullable: true, description: `Detailed description or notes about the activity`}) 
    Description?: string;
        
    @Field({description: `Date and time when the activity starts`}) 
    @MaxLength(8)
    StartDate: Date;
        
    @Field({nullable: true, description: `Date and time when the activity ends`}) 
    @MaxLength(8)
    EndDate?: Date;
        
    @Field({description: `Current status of the activity (Planned, Completed, etc.)`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `Priority level of the activity (High, Medium, Low)`}) 
    @MaxLength(20)
    Priority?: string;
        
    @Field({nullable: true, description: `Direction of communication (Inbound, Outbound, Internal)`}) 
    @MaxLength(20)
    Direction?: string;
        
    @Field({nullable: true, description: `Physical or virtual location of the activity`}) 
    @MaxLength(200)
    Location?: string;
        
    @Field({nullable: true, description: `Outcome or result of the activity`}) 
    @MaxLength(200)
    Result?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreateActivityInput {
    @Field(() => Int, { nullable: true })
    AccountID: number | null;

    @Field(() => Int, { nullable: true })
    ContactID: number | null;

    @Field({ nullable: true })
    ActivityType?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Priority: string | null;

    @Field({ nullable: true })
    Direction: string | null;

    @Field({ nullable: true })
    Location: string | null;

    @Field({ nullable: true })
    Result: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class UpdateActivityInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    AccountID?: number | null;

    @Field(() => Int, { nullable: true })
    ContactID?: number | null;

    @Field({ nullable: true })
    ActivityType?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Priority?: string | null;

    @Field({ nullable: true })
    Direction?: string | null;

    @Field({ nullable: true })
    Location?: string | null;

    @Field({ nullable: true })
    Result?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RunActivityViewResult {
    @Field(() => [Activity_])
    Results: Activity_[];

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

@Resolver(Activity_)
export class ActivityResolver extends ResolverBase {
    @Query(() => RunActivityViewResult)
    async RunActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunActivityViewResult)
    async RunActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunActivityViewResult)
    async RunActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Activity_, { nullable: true })
    async Activity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Activity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivities] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Activity_)
    async CreateActivity(
        @Arg('input', () => CreateActivityInput) input: CreateActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Activity_)
    async UpdateActivity(
        @Arg('input', () => UpdateActivityInput) input: UpdateActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Activity_)
    async DeleteActivity(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Relationships
//****************************************************************************
@ObjectType({ description: `Stores relationship connections between contacts` })
export class ContactRelationship_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {description: `ID of the primary contact in the relationship (e.g., the parent)`}) 
    PrimaryContactID: number;
        
    @Field(() => Int, {description: `ID of the related contact in the relationship (e.g., the child)`}) 
    RelatedContactID: number;
        
    @Field(() => Int, {description: `ID of the relationship type defining how contacts are related`}) 
    RelationshipTypeID: number;
        
    @Field({nullable: true, description: `Date when the relationship started`}) 
    @MaxLength(3)
    StartDate?: Date;
        
    @Field({nullable: true, description: `Date when the relationship ended (if applicable)`}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field({nullable: true, description: `Additional notes or details about the relationship`}) 
    @MaxLength(1000)
    Notes?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Indicates whether the relationship is currently active`}) 
    IsActive?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Relationships
//****************************************************************************
@InputType()
export class CreateContactRelationshipInput {
    @Field(() => Int, { nullable: true })
    PrimaryContactID?: number;

    @Field(() => Int, { nullable: true })
    RelatedContactID?: number;

    @Field(() => Int, { nullable: true })
    RelationshipTypeID?: number;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Relationships
//****************************************************************************
@InputType()
export class UpdateContactRelationshipInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    PrimaryContactID?: number;

    @Field(() => Int, { nullable: true })
    RelatedContactID?: number;

    @Field(() => Int, { nullable: true })
    RelationshipTypeID?: number;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Relationships
//****************************************************************************
@ObjectType()
export class RunContactRelationshipViewResult {
    @Field(() => [ContactRelationship_])
    Results: ContactRelationship_[];

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

@Resolver(ContactRelationship_)
export class ContactRelationshipResolver extends ResolverBase {
    @Query(() => RunContactRelationshipViewResult)
    async RunContactRelationshipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactRelationshipViewResult)
    async RunContactRelationshipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactRelationshipViewResult)
    async RunContactRelationshipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Relationships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ContactRelationship_, { nullable: true })
    async ContactRelationship(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactRelationship_ | null> {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contact Relationships', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => ContactRelationship_)
    async CreateContactRelationship(
        @Arg('input', () => CreateContactRelationshipInput) input: CreateContactRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Relationships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ContactRelationship_)
    async UpdateContactRelationship(
        @Arg('input', () => UpdateContactRelationshipInput) input: UpdateContactRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Relationships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ContactRelationship_)
    async DeleteContactRelationship(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Relationships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `Stores information about individual people associated with accounts` })
export class Contact_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    AccountID?: number;
        
    @Field({nullable: true, description: `Salutation or title prefix (Mr., Ms., Dr., etc.)`}) 
    @MaxLength(20)
    Salutation?: string;
        
    @Field({description: `First name of the contact`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Last name of the contact`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({description: `Full name of the contact (computed column)`}) 
    @MaxLength(202)
    FullName: string;
        
    @Field({nullable: true, description: `Job title of the contact`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `Department the contact works in`}) 
    @MaxLength(200)
    Department?: string;
        
    @Field({nullable: true, description: `Email address of the contact`}) 
    @MaxLength(200)
    Email?: string;
        
    @Field({nullable: true, description: `Primary work phone number of the contact`}) 
    @MaxLength(40)
    Phone?: string;
        
    @Field({nullable: true, description: `Mobile phone number of the contact`}) 
    @MaxLength(40)
    Mobile?: string;
        
    @Field(() => Int, {nullable: true}) 
    ReportsToID?: number;
        
    @Field({nullable: true, description: `Street address for mailing`}) 
    @MaxLength(200)
    MailingStreet?: string;
        
    @Field({nullable: true, description: `City for mailing address`}) 
    @MaxLength(100)
    MailingCity?: string;
        
    @Field({nullable: true, description: `State/province for mailing address`}) 
    @MaxLength(100)
    MailingState?: string;
        
    @Field({nullable: true, description: `Postal/ZIP code for mailing address`}) 
    @MaxLength(40)
    MailingPostalCode?: string;
        
    @Field({nullable: true, description: `Country for mailing address`}) 
    @MaxLength(100)
    MailingCountry?: string;
        
    @Field({nullable: true, description: `Birth date of the contact`}) 
    @MaxLength(3)
    BirthDate?: Date;
        
    @Field({nullable: true, description: `Preferred method of communication (Email, Phone, Mobile, etc.)`}) 
    @MaxLength(40)
    PreferredContactMethod?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Indicates whether the contact is currently active`}) 
    IsActive?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [ContactRelationship_])
    ContactRelationships_PrimaryContactIDArray: ContactRelationship_[]; // Link to ContactRelationships
    
    @Field(() => [Activity_])
    Activities_ContactIDArray: Activity_[]; // Link to Activities
    
    @Field(() => [Contact_])
    Contacts_ReportsToIDArray: Contact_[]; // Link to Contacts
    
    @Field(() => [ContactRelationship_])
    ContactRelationships_RelatedContactIDArray: ContactRelationship_[]; // Link to ContactRelationships
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateContactInput {
    @Field(() => Int, { nullable: true })
    AccountID: number | null;

    @Field({ nullable: true })
    Salutation: string | null;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Department: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Mobile: string | null;

    @Field(() => Int, { nullable: true })
    ReportsToID: number | null;

    @Field({ nullable: true })
    MailingStreet: string | null;

    @Field({ nullable: true })
    MailingCity: string | null;

    @Field({ nullable: true })
    MailingState: string | null;

    @Field({ nullable: true })
    MailingPostalCode: string | null;

    @Field({ nullable: true })
    MailingCountry: string | null;

    @Field({ nullable: true })
    BirthDate: Date | null;

    @Field({ nullable: true })
    PreferredContactMethod: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdateContactInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    AccountID?: number | null;

    @Field({ nullable: true })
    Salutation?: string | null;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Department?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Mobile?: string | null;

    @Field(() => Int, { nullable: true })
    ReportsToID?: number | null;

    @Field({ nullable: true })
    MailingStreet?: string | null;

    @Field({ nullable: true })
    MailingCity?: string | null;

    @Field({ nullable: true })
    MailingState?: string | null;

    @Field({ nullable: true })
    MailingPostalCode?: string | null;

    @Field({ nullable: true })
    MailingCountry?: string | null;

    @Field({ nullable: true })
    BirthDate?: Date | null;

    @Field({ nullable: true })
    PreferredContactMethod?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunContactViewResult {
    @Field(() => [Contact_])
    Results: Contact_[];

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

@Resolver(Contact_)
export class ContactResolver extends ResolverBase {
    @Query(() => RunContactViewResult)
    async RunContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactViewResult)
    async RunContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactViewResult)
    async RunContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Contact_, { nullable: true })
    async Contact(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Contact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [ContactRelationship_])
    async ContactRelationships_PrimaryContactIDArray(@Root() contact_: Contact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [PrimaryContactID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contact Relationships', rows);
        return result;
    }
        
    @FieldResolver(() => [Activity_])
    async Activities_ContactIDArray(@Root() contact_: Contact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivities] WHERE [ContactID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', rows);
        return result;
    }
        
    @FieldResolver(() => [Contact_])
    async Contacts_ReportsToIDArray(@Root() contact_: Contact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts] WHERE [ReportsToID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', rows);
        return result;
    }
        
    @FieldResolver(() => [ContactRelationship_])
    async ContactRelationships_RelatedContactIDArray(@Root() contact_: Contact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [RelatedContactID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contact Relationships', rows);
        return result;
    }
        
    @Mutation(() => Contact_)
    async CreateContact(
        @Arg('input', () => CreateContactInput) input: CreateContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Contact_)
    async UpdateContact(
        @Arg('input', () => UpdateContactInput) input: UpdateContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Contact_)
    async DeleteContact(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Types
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing activity type values` })
export class ActivityType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the activity type`}) 
    @MaxLength(100)
    TypeName: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activity Types
//****************************************************************************
@InputType()
export class CreateActivityTypeInput {
    @Field({ nullable: true })
    TypeName?: string;
}
    

//****************************************************************************
// INPUT TYPE for Activity Types
//****************************************************************************
@InputType()
export class UpdateActivityTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    TypeName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Types
//****************************************************************************
@ObjectType()
export class RunActivityTypeViewResult {
    @Field(() => [ActivityType_])
    Results: ActivityType_[];

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

@Resolver(ActivityType_)
export class ActivityTypeResolver extends ResolverBase {
    @Query(() => RunActivityTypeViewResult)
    async RunActivityTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunActivityTypeViewResult)
    async RunActivityTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunActivityTypeViewResult)
    async RunActivityTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ActivityType_, { nullable: true })
    async ActivityType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActivityType_ | null> {
        this.CheckUserReadPermissions('Activity Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivityTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Activity Types', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => ActivityType_)
    async CreateActivityType(
        @Arg('input', () => CreateActivityTypeInput) input: CreateActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ActivityType_)
    async UpdateActivityType(
        @Arg('input', () => UpdateActivityTypeInput) input: UpdateActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ActivityType_)
    async DeleteActivityType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Relationship Types
//****************************************************************************
@ObjectType({ description: `Lookup table for defining relationship types between contacts and their inverse relationships` })
export class RelationshipType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the relationship type (e.g., Parent, Child, Spouse)`}) 
    @MaxLength(100)
    TypeName: string;
        
    @Field(() => Boolean, {description: `Indicates if the relationship is the same in both directions (e.g., Spouse, Friend)`}) 
    IsBidirectional: boolean;
        
    @Field(() => Int, {nullable: true, description: `ID of the inverse relationship type (e.g., Parent → Child)`}) 
    InverseRelationshipID?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [RelationshipType_])
    RelationshipTypes_InverseRelationshipIDArray: RelationshipType_[]; // Link to RelationshipTypes
    
    @Field(() => [ContactRelationship_])
    ContactRelationships_RelationshipTypeIDArray: ContactRelationship_[]; // Link to ContactRelationships
    
}

//****************************************************************************
// INPUT TYPE for Relationship Types
//****************************************************************************
@InputType()
export class CreateRelationshipTypeInput {
    @Field({ nullable: true })
    TypeName?: string;

    @Field(() => Boolean, { nullable: true })
    IsBidirectional?: boolean;

    @Field(() => Int, { nullable: true })
    InverseRelationshipID: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Relationship Types
//****************************************************************************
@InputType()
export class UpdateRelationshipTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    TypeName?: string;

    @Field(() => Boolean, { nullable: true })
    IsBidirectional?: boolean;

    @Field(() => Int, { nullable: true })
    InverseRelationshipID?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Relationship Types
//****************************************************************************
@ObjectType()
export class RunRelationshipTypeViewResult {
    @Field(() => [RelationshipType_])
    Results: RelationshipType_[];

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

@Resolver(RelationshipType_)
export class RelationshipTypeResolver extends ResolverBase {
    @Query(() => RunRelationshipTypeViewResult)
    async RunRelationshipTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunRelationshipTypeViewResult)
    async RunRelationshipTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunRelationshipTypeViewResult)
    async RunRelationshipTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Relationship Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => RelationshipType_, { nullable: true })
    async RelationshipType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<RelationshipType_ | null> {
        this.CheckUserReadPermissions('Relationship Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwRelationshipTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Relationship Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Relationship Types', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [RelationshipType_])
    async RelationshipTypes_InverseRelationshipIDArray(@Root() relationshiptype_: RelationshipType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationship Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwRelationshipTypes] WHERE [InverseRelationshipID]=${relationshiptype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Relationship Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Relationship Types', rows);
        return result;
    }
        
    @FieldResolver(() => [ContactRelationship_])
    async ContactRelationships_RelationshipTypeIDArray(@Root() relationshiptype_: RelationshipType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [RelationshipTypeID]=${relationshiptype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contact Relationships', rows);
        return result;
    }
        
    @Mutation(() => RelationshipType_)
    async CreateRelationshipType(
        @Arg('input', () => CreateRelationshipTypeInput) input: CreateRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Relationship Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => RelationshipType_)
    async UpdateRelationshipType(
        @Arg('input', () => UpdateRelationshipTypeInput) input: UpdateRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Relationship Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => RelationshipType_)
    async DeleteRelationshipType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Relationship Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Accounts
//****************************************************************************
@ObjectType({ description: `Stores information about customer organizations and companies` })
export class Account_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Official name of the organization or company`}) 
    @MaxLength(200)
    AccountName: string;
        
    @Field({nullable: true, description: `Industry sector the account belongs to`}) 
    @MaxLength(100)
    Industry?: string;
        
    @Field(() => Float, {nullable: true, description: `Estimated annual revenue of the account in local currency`}) 
    AnnualRevenue?: number;
        
    @Field({nullable: true, description: `Primary website URL of the account`}) 
    @MaxLength(510)
    Website?: string;
        
    @Field({nullable: true, description: `Main phone number for the account`}) 
    @MaxLength(40)
    Phone?: string;
        
    @Field({nullable: true, description: `Fax number for the account`}) 
    @MaxLength(40)
    Fax?: string;
        
    @Field({nullable: true, description: `Street address for billing`}) 
    @MaxLength(200)
    BillingStreet?: string;
        
    @Field({nullable: true, description: `City for billing address`}) 
    @MaxLength(100)
    BillingCity?: string;
        
    @Field({nullable: true, description: `State/province for billing address`}) 
    @MaxLength(100)
    BillingState?: string;
        
    @Field({nullable: true, description: `Postal/ZIP code for billing address`}) 
    @MaxLength(40)
    BillingPostalCode?: string;
        
    @Field({nullable: true, description: `Country for billing address`}) 
    @MaxLength(100)
    BillingCountry?: string;
        
    @Field({nullable: true, description: `Street address for shipping`}) 
    @MaxLength(200)
    ShippingStreet?: string;
        
    @Field({nullable: true, description: `City for shipping address`}) 
    @MaxLength(100)
    ShippingCity?: string;
        
    @Field({nullable: true, description: `State/province for shipping address`}) 
    @MaxLength(100)
    ShippingState?: string;
        
    @Field({nullable: true, description: `Postal/ZIP code for shipping address`}) 
    @MaxLength(40)
    ShippingPostalCode?: string;
        
    @Field({nullable: true, description: `Country for shipping address`}) 
    @MaxLength(100)
    ShippingCountry?: string;
        
    @Field({nullable: true, description: `Type of relationship with the account (Prospect, Customer, etc.)`}) 
    @MaxLength(100)
    AccountType?: string;
        
    @Field({nullable: true, description: `Current status of the account (Active, Inactive, etc.)`}) 
    @MaxLength(40)
    AccountStatus?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Indicates whether the account is currently active`}) 
    IsActive?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Contact_])
    Contacts_AccountIDArray: Contact_[]; // Link to Contacts
    
    @Field(() => [Activity_])
    Activities_AccountIDArray: Activity_[]; // Link to Activities
    
}

//****************************************************************************
// INPUT TYPE for Accounts
//****************************************************************************
@InputType()
export class CreateAccountInput {
    @Field({ nullable: true })
    AccountName?: string;

    @Field({ nullable: true })
    Industry: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue: number | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Fax: string | null;

    @Field({ nullable: true })
    BillingStreet: string | null;

    @Field({ nullable: true })
    BillingCity: string | null;

    @Field({ nullable: true })
    BillingState: string | null;

    @Field({ nullable: true })
    BillingPostalCode: string | null;

    @Field({ nullable: true })
    BillingCountry: string | null;

    @Field({ nullable: true })
    ShippingStreet: string | null;

    @Field({ nullable: true })
    ShippingCity: string | null;

    @Field({ nullable: true })
    ShippingState: string | null;

    @Field({ nullable: true })
    ShippingPostalCode: string | null;

    @Field({ nullable: true })
    ShippingCountry: string | null;

    @Field({ nullable: true })
    AccountType: string | null;

    @Field({ nullable: true })
    AccountStatus: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Accounts
//****************************************************************************
@InputType()
export class UpdateAccountInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    AccountName?: string;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue?: number | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Fax?: string | null;

    @Field({ nullable: true })
    BillingStreet?: string | null;

    @Field({ nullable: true })
    BillingCity?: string | null;

    @Field({ nullable: true })
    BillingState?: string | null;

    @Field({ nullable: true })
    BillingPostalCode?: string | null;

    @Field({ nullable: true })
    BillingCountry?: string | null;

    @Field({ nullable: true })
    ShippingStreet?: string | null;

    @Field({ nullable: true })
    ShippingCity?: string | null;

    @Field({ nullable: true })
    ShippingState?: string | null;

    @Field({ nullable: true })
    ShippingPostalCode?: string | null;

    @Field({ nullable: true })
    ShippingCountry?: string | null;

    @Field({ nullable: true })
    AccountType?: string | null;

    @Field({ nullable: true })
    AccountStatus?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Accounts
//****************************************************************************
@ObjectType()
export class RunAccountViewResult {
    @Field(() => [Account_])
    Results: Account_[];

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

@Resolver(Account_)
export class AccountResolver extends ResolverBase {
    @Query(() => RunAccountViewResult)
    async RunAccountViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountViewResult)
    async RunAccountViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountViewResult)
    async RunAccountDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Accounts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Account_, { nullable: true })
    async Account(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Account_ | null> {
        this.CheckUserReadPermissions('Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccounts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Accounts', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Contact_])
    async Contacts_AccountIDArray(@Root() account_: Account_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts] WHERE [AccountID]=${account_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', rows);
        return result;
    }
        
    @FieldResolver(() => [Activity_])
    async Activities_AccountIDArray(@Root() account_: Account_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivities] WHERE [AccountID]=${account_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', rows);
        return result;
    }
        
    @Mutation(() => Account_)
    async CreateAccount(
        @Arg('input', () => CreateAccountInput) input: CreateAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Accounts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Account_)
    async UpdateAccount(
        @Arg('input', () => UpdateAccountInput) input: UpdateAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Accounts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Account_)
    async DeleteAccount(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Accounts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Status
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing account status values` })
export class AccountStatus_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the account status`}) 
    @MaxLength(40)
    StatusName: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account Status
//****************************************************************************
@InputType()
export class CreateAccountStatusInput {
    @Field({ nullable: true })
    StatusName?: string;
}
    

//****************************************************************************
// INPUT TYPE for Account Status
//****************************************************************************
@InputType()
export class UpdateAccountStatusInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    StatusName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Account Status
//****************************************************************************
@ObjectType()
export class RunAccountStatusViewResult {
    @Field(() => [AccountStatus_])
    Results: AccountStatus_[];

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

@Resolver(AccountStatus_)
export class AccountStatusResolver extends ResolverBase {
    @Query(() => RunAccountStatusViewResult)
    async RunAccountStatusViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountStatusViewResult)
    async RunAccountStatusViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountStatusViewResult)
    async RunAccountStatusDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Status';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AccountStatus_, { nullable: true })
    async AccountStatus(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AccountStatus_ | null> {
        this.CheckUserReadPermissions('Account Status', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountStatus] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Status', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Account Status', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => AccountStatus_)
    async CreateAccountStatus(
        @Arg('input', () => CreateAccountStatusInput) input: CreateAccountStatusInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Status', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AccountStatus_)
    async UpdateAccountStatus(
        @Arg('input', () => UpdateAccountStatusInput) input: UpdateAccountStatusInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Status', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AccountStatus_)
    async DeleteAccountStatus(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Status', key, options, provider, userPayload, pubSub);
    }
    
}