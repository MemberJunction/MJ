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


import { APIKeyScopeEntity, APIKeyEntity, ChannelActionEntity, ChannelMessageAttachmentEntity, ChannelMessageEntity, ChannelRunEntity, ChannelTypeActionEntity, ChannelTypeEntity, ChannelEntity, ContactRoleEntity, ContactEntity, CredentialTypeEntity, CredentialEntity, flyway_schema_history__IzzyEntity, IzzyActionCategoryEntity, IzzyActionOrganizationEntity, IzzyActionEntity, IzzyAIConfigurationEntity, OrganizationActionEntity, OrganizationContactEntity, OrganizationSettingEntity, OrganizationEntity, PlanEntity, ScopeEntity, SettingCategoryEntity, SettingEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for API Key Scopes
//****************************************************************************
@ObjectType({ description: `Links API keys to their granted permission scopes` })
export class IzzyAPIKeyScope_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    APIKeyID: string;
        
    @Field() 
    @MaxLength(16)
    ScopeID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    APIKey: string;
        
    @Field() 
    @MaxLength(200)
    Scope: string;
        
}

//****************************************************************************
// INPUT TYPE for API Key Scopes
//****************************************************************************
@InputType()
export class CreateIzzyAPIKeyScopeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    APIKeyID?: string;

    @Field({ nullable: true })
    ScopeID?: string;
}
    

//****************************************************************************
// INPUT TYPE for API Key Scopes
//****************************************************************************
@InputType()
export class UpdateIzzyAPIKeyScopeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    APIKeyID?: string;

    @Field({ nullable: true })
    ScopeID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for API Key Scopes
//****************************************************************************
@ObjectType()
export class RunIzzyAPIKeyScopeViewResult {
    @Field(() => [IzzyAPIKeyScope_])
    Results: IzzyAPIKeyScope_[];

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

@Resolver(IzzyAPIKeyScope_)
export class IzzyAPIKeyScopeResolver extends ResolverBase {
    @Query(() => RunIzzyAPIKeyScopeViewResult)
    async RunIzzyAPIKeyScopeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyAPIKeyScopeViewResult)
    async RunIzzyAPIKeyScopeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyAPIKeyScopeViewResult)
    async RunIzzyAPIKeyScopeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'API Key Scopes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyAPIKeyScope_, { nullable: true })
    async IzzyAPIKeyScope(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyAPIKeyScope_ | null> {
        this.CheckUserReadPermissions('API Key Scopes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwAPIKeyScopes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'API Key Scopes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('API Key Scopes', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyAPIKeyScope_)
    async CreateIzzyAPIKeyScope(
        @Arg('input', () => CreateIzzyAPIKeyScopeInput) input: CreateIzzyAPIKeyScopeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('API Key Scopes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyAPIKeyScope_)
    async UpdateIzzyAPIKeyScope(
        @Arg('input', () => UpdateIzzyAPIKeyScopeInput) input: UpdateIzzyAPIKeyScopeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('API Key Scopes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyAPIKeyScope_)
    async DeleteIzzyAPIKeyScope(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('API Key Scopes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for API Keys
//****************************************************************************
@ObjectType({ description: `API keys for programmatic access to the platform` })
export class IzzyAPIKey_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `SHA-256 hash of the API key (actual key shown once at creation)`}) 
    @MaxLength(128)
    Hash: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field({description: `User-provided label for identifying this key`}) 
    @MaxLength(510)
    Label: string;
        
    @Field({description: `Key status: Active, Expired, Revoked, Suspended`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `When this key expires (null = never)`}) 
    @MaxLength(10)
    ExpiresAt?: Date;
        
    @Field({nullable: true, description: `Last time this key was used for authentication`}) 
    @MaxLength(10)
    LastUsedAt?: Date;
        
    @Field() 
    @MaxLength(16)
    CreatedByID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(510)
    CreatedBy: string;
        
    @Field(() => [IzzyAPIKeyScope_])
    APIKeyScopes_APIKeyIDArray: IzzyAPIKeyScope_[]; // Link to APIKeyScopes
    
}

//****************************************************************************
// INPUT TYPE for API Keys
//****************************************************************************
@InputType()
export class CreateIzzyAPIKeyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Hash?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt: Date | null;

    @Field({ nullable: true })
    LastUsedAt: Date | null;

    @Field({ nullable: true })
    CreatedByID?: string;
}
    

//****************************************************************************
// INPUT TYPE for API Keys
//****************************************************************************
@InputType()
export class UpdateIzzyAPIKeyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Hash?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date | null;

    @Field({ nullable: true })
    LastUsedAt?: Date | null;

    @Field({ nullable: true })
    CreatedByID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for API Keys
//****************************************************************************
@ObjectType()
export class RunIzzyAPIKeyViewResult {
    @Field(() => [IzzyAPIKey_])
    Results: IzzyAPIKey_[];

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

@Resolver(IzzyAPIKey_)
export class IzzyAPIKeyResolver extends ResolverBase {
    @Query(() => RunIzzyAPIKeyViewResult)
    async RunIzzyAPIKeyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyAPIKeyViewResult)
    async RunIzzyAPIKeyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyAPIKeyViewResult)
    async RunIzzyAPIKeyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'API Keys';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyAPIKey_, { nullable: true })
    async IzzyAPIKey(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyAPIKey_ | null> {
        this.CheckUserReadPermissions('API Keys', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwAPIKeys] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'API Keys', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('API Keys', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyAPIKeyScope_])
    async APIKeyScopes_APIKeyIDArray(@Root() izzyapikey_: IzzyAPIKey_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('API Key Scopes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwAPIKeyScopes] WHERE [APIKeyID]='${izzyapikey_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'API Key Scopes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('API Key Scopes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyAPIKey_)
    async CreateIzzyAPIKey(
        @Arg('input', () => CreateIzzyAPIKeyInput) input: CreateIzzyAPIKeyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('API Keys', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyAPIKey_)
    async UpdateIzzyAPIKey(
        @Arg('input', () => UpdateIzzyAPIKeyInput) input: UpdateIzzyAPIKeyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('API Keys', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyAPIKey_)
    async DeleteIzzyAPIKey(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('API Keys', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Actions
//****************************************************************************
@ObjectType({ description: `Channel-specific action configuration (bottom of inheritance)` })
export class IzzyChannelAction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ChannelID: string;
        
    @Field() 
    @MaxLength(16)
    ActionID: string;
        
    @Field({description: `Action status at channel level: Active, Pending, Revoked, Disabled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Int, {description: `Execution order when multiple actions are available`}) 
    Sequence: number;
        
    @Field({nullable: true, description: `JSON configuration for this action at channel level`}) 
    Configuration?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Reference to the credential used for this action at channel level`}) 
    @MaxLength(16)
    CredentialID?: string;
        
    @Field() 
    @MaxLength(510)
    Channel: string;
        
    @Field() 
    @MaxLength(850)
    Action: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Credential?: string;
        
}

//****************************************************************************
// INPUT TYPE for Channel Actions
//****************************************************************************
@InputType()
export class CreateIzzyChannelActionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    CredentialID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Channel Actions
//****************************************************************************
@InputType()
export class UpdateIzzyChannelActionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    CredentialID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Actions
//****************************************************************************
@ObjectType()
export class RunIzzyChannelActionViewResult {
    @Field(() => [IzzyChannelAction_])
    Results: IzzyChannelAction_[];

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

@Resolver(IzzyChannelAction_)
export class IzzyChannelActionResolver extends ResolverBase {
    @Query(() => RunIzzyChannelActionViewResult)
    async RunIzzyChannelActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelActionViewResult)
    async RunIzzyChannelActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelActionViewResult)
    async RunIzzyChannelActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channel Actions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannelAction_, { nullable: true })
    async IzzyChannelAction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannelAction_ | null> {
        this.CheckUserReadPermissions('Channel Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelActions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channel Actions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyChannelAction_)
    async CreateIzzyChannelAction(
        @Arg('input', () => CreateIzzyChannelActionInput) input: CreateIzzyChannelActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channel Actions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannelAction_)
    async UpdateIzzyChannelAction(
        @Arg('input', () => UpdateIzzyChannelActionInput) input: UpdateIzzyChannelActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channel Actions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannelAction_)
    async DeleteIzzyChannelAction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Actions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Message Attachments
//****************************************************************************
@ObjectType({ description: `Stores email attachments for ChannelMessages. Supports both inline images (embedded with cid: references) and standard attachments (files to download). Phase 1: Inline images converted to data URIs. Phase 2: Standard attachments stored here.` })
export class IzzyChannelMessageAttachment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Foreign key to ChannelMessage table`}) 
    @MaxLength(16)
    ChannelMessageID: string;
        
    @Field({nullable: true, description: `The attachment ID from the external system (e.g. MS Graph attachment ID)`}) 
    @MaxLength(1000)
    ExternalSystemAttachmentID?: string;
        
    @Field({description: `Original filename of the attachment`}) 
    @MaxLength(1000)
    Filename: string;
        
    @Field({description: `MIME type of the attachment (e.g. image/png, application/pdf)`}) 
    @MaxLength(400)
    ContentType: string;
        
    @Field(() => Int, {description: `Size of the attachment in bytes`}) 
    Size: number;
        
    @Field(() => Boolean, {description: `True if this is an inline image embedded in the email body (referenced by cid:)`}) 
    IsInline: boolean;
        
    @Field({nullable: true, description: `Content-ID used to reference inline images in HTML (e.g. "image001@microsoft.com" for <img src="cid:image001@microsoft.com">)`}) 
    @MaxLength(1000)
    ContentID?: string;
        
    @Field(() => Int, {nullable: true, description: `Binary content of the attachment. NULL if stored externally (see StoragePath)`}) 
    Content?: number;
        
    @Field({nullable: true, description: `Optional path to external storage (e.g. Azure Blob Storage URL) if Content is not stored in database`}) 
    @MaxLength(2000)
    StoragePath?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    ChannelMessage?: string;
        
}

//****************************************************************************
// INPUT TYPE for Channel Message Attachments
//****************************************************************************
@InputType()
export class CreateIzzyChannelMessageAttachmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChannelMessageID?: string;

    @Field({ nullable: true })
    ExternalSystemAttachmentID: string | null;

    @Field({ nullable: true })
    Filename?: string;

    @Field({ nullable: true })
    ContentType?: string;

    @Field(() => Int, { nullable: true })
    Size?: number;

    @Field(() => Boolean, { nullable: true })
    IsInline?: boolean;

    @Field({ nullable: true })
    ContentID: string | null;

    @Field(() => Int, { nullable: true })
    Content: number | null;

    @Field({ nullable: true })
    StoragePath: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Channel Message Attachments
//****************************************************************************
@InputType()
export class UpdateIzzyChannelMessageAttachmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChannelMessageID?: string;

    @Field({ nullable: true })
    ExternalSystemAttachmentID?: string | null;

    @Field({ nullable: true })
    Filename?: string;

    @Field({ nullable: true })
    ContentType?: string;

    @Field(() => Int, { nullable: true })
    Size?: number;

    @Field(() => Boolean, { nullable: true })
    IsInline?: boolean;

    @Field({ nullable: true })
    ContentID?: string | null;

    @Field(() => Int, { nullable: true })
    Content?: number | null;

    @Field({ nullable: true })
    StoragePath?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Message Attachments
//****************************************************************************
@ObjectType()
export class RunIzzyChannelMessageAttachmentViewResult {
    @Field(() => [IzzyChannelMessageAttachment_])
    Results: IzzyChannelMessageAttachment_[];

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

@Resolver(IzzyChannelMessageAttachment_)
export class IzzyChannelMessageAttachmentResolver extends ResolverBase {
    @Query(() => RunIzzyChannelMessageAttachmentViewResult)
    async RunIzzyChannelMessageAttachmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelMessageAttachmentViewResult)
    async RunIzzyChannelMessageAttachmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelMessageAttachmentViewResult)
    async RunIzzyChannelMessageAttachmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channel Message Attachments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannelMessageAttachment_, { nullable: true })
    async IzzyChannelMessageAttachment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannelMessageAttachment_ | null> {
        this.CheckUserReadPermissions('Channel Message Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessageAttachments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Message Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channel Message Attachments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyChannelMessageAttachment_)
    async CreateIzzyChannelMessageAttachment(
        @Arg('input', () => CreateIzzyChannelMessageAttachmentInput) input: CreateIzzyChannelMessageAttachmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channel Message Attachments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannelMessageAttachment_)
    async UpdateIzzyChannelMessageAttachment(
        @Arg('input', () => UpdateIzzyChannelMessageAttachmentInput) input: UpdateIzzyChannelMessageAttachmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channel Message Attachments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannelMessageAttachment_)
    async DeleteIzzyChannelMessageAttachment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Message Attachments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Messages
//****************************************************************************
@ObjectType({ description: `Individual messages received through channels` })
export class IzzyChannelMessage_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ChannelID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ChannelRunID?: string;
        
    @Field({nullable: true, description: `External system message ID for deduplication`}) 
    ExternalSystemRecordID?: string;
        
    @Field({description: `When the message was received`}) 
    @MaxLength(10)
    ReceivedAt: Date;
        
    @Field({nullable: true, description: `Message subject line (for email)`}) 
    Subject?: string;
        
    @Field({description: `The message body content`}) 
    MessageContent: string;
        
    @Field(() => Boolean, {description: `Whether this message contains sensitive/secure content`}) 
    IsSecure: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentID?: string;
        
    @Field({nullable: true, description: `Thread identifier for grouping related messages`}) 
    @MaxLength(510)
    ThreadID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ContactID?: string;
        
    @Field({description: `Sender email/phone/identifier`}) 
    @MaxLength(1000)
    Sender: string;
        
    @Field({description: `Recipient email/phone/identifier`}) 
    @MaxLength(1000)
    Recipient: string;
        
    @Field({description: `AI generation status: Read, Creating Reply, Generated, Skipped, Failed`}) 
    @MaxLength(100)
    GenerationStatus: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    AIAgentRunID?: string;
        
    @Field({nullable: true, description: `Vector embedding of inbound message for similarity search`}) 
    InboundVectorJSON?: string;
        
    @Field({nullable: true, description: `Vector embedding of reply for similarity search`}) 
    ReplyVectorJSON?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    VectorModelID?: string;
        
    @Field({nullable: true, description: `Approval status: Pending, Approved, Rejected, Not Required`}) 
    @MaxLength(100)
    ApprovalStatus?: string;
        
    @Field({nullable: true, description: `Feedback from approver on why approved/rejected`}) 
    ApprovalFeedback?: string;
        
    @Field({nullable: true, description: `AI-generated reply content`}) 
    GeneratedReplyContent?: string;
        
    @Field({nullable: true, description: `Final approved reply content (may be edited from generated)`}) 
    ApprovedReplyContent?: string;
        
    @Field({nullable: true, description: `When the reply was approved`}) 
    @MaxLength(10)
    ApprovedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ApprovedByContactID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Timestamp when Izzy finished generating the response for this message`}) 
    @MaxLength(10)
    GeneratedAt?: Date;
        
    @Field({nullable: true, description: `Timestamp when the response was actually sent to the recipient`}) 
    @MaxLength(10)
    SentAt?: Date;
        
    @Field(() => Float, {nullable: true, description: `AI-generated confidence score for the response quality (0-100 percentage)`}) 
    AIConfidenceScore?: number;
        
    @Field({nullable: true, description: `AI-generated explanation for the confidence score, including any concerns or areas of uncertainty`}) 
    AIConfidenceReason?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Whether this message was automatically approved based on confidence score meeting or exceeding the threshold`}) 
    AIAutoApproved?: boolean;
        
    @Field({nullable: true, description: `Timestamp when the AI confidence evaluation was performed`}) 
    @MaxLength(10)
    AIEvaluatedAt?: Date;
        
    @Field({nullable: true, description: `Format of the inbound message content. Values: HTML, PlainText, Markdown. Used to determine reply format.`}) 
    @MaxLength(40)
    MessageFormat?: string;
        
    @Field({nullable: true, description: `Category indicating why the message was skipped. From early rejection: spam, automated-message, prank, phishing. From decision rejection: legal-advice, financial-dispute, explicit-human-request, urgent-sensitive-personal, urgent-sensitive-business, policy-exception, complex-technical, password-reset-failure, marketing-speaker, inappropriate, out-of-scope`}) 
    @MaxLength(200)
    SkipCategory?: string;
        
    @Field({nullable: true, description: `AI-generated reasoning explaining why the message was skipped or rejected`}) 
    SkipReasoning?: string;
        
    @Field(() => Boolean, {description: `Flag indicating the message was identified as spam. Used to filter spam out of pending message lists.`}) 
    IsSpam: boolean;
        
    @Field({nullable: true, description: `Type of error that occurred during processing or sending. Values: AgentFailure, SendFailure, CredentialFailure, ProviderNotFound, ValidationFailure, ChannelConfigFailure, Timeout, RateLimited, Other`}) 
    @MaxLength(100)
    ErrorType?: string;
        
    @Field({nullable: true, description: `Detailed error message describing what went wrong during processing or sending. Useful for debugging and support.`}) 
    ErrorMessage?: string;
        
    @Field({nullable: true, description: `The exact content that was sent to the recipient, including any signatures and branding. Populated after successful send for audit trail.`}) 
    SentContent?: string;
        
    @Field() 
    @MaxLength(510)
    Channel: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ChannelRun?: string;
        
    @Field({nullable: true}) 
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Contact?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ApprovedByContact?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentID?: string;
        
    @Field(() => [IzzyChannelMessageAttachment_])
    ChannelMessageAttachments_ChannelMessageIDArray: IzzyChannelMessageAttachment_[]; // Link to ChannelMessageAttachments
    
    @Field(() => [IzzyChannelMessage_])
    ChannelMessages_ParentIDArray: IzzyChannelMessage_[]; // Link to ChannelMessages
    
}

//****************************************************************************
// INPUT TYPE for Channel Messages
//****************************************************************************
@InputType()
export class CreateIzzyChannelMessageInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    ChannelRunID: string | null;

    @Field({ nullable: true })
    ExternalSystemRecordID: string | null;

    @Field({ nullable: true })
    ReceivedAt?: Date;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    MessageContent?: string;

    @Field(() => Boolean, { nullable: true })
    IsSecure?: boolean;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    ThreadID: string | null;

    @Field({ nullable: true })
    ContactID: string | null;

    @Field({ nullable: true })
    Sender?: string;

    @Field({ nullable: true })
    Recipient?: string;

    @Field({ nullable: true })
    GenerationStatus?: string;

    @Field({ nullable: true })
    AIAgentRunID: string | null;

    @Field({ nullable: true })
    InboundVectorJSON: string | null;

    @Field({ nullable: true })
    ReplyVectorJSON: string | null;

    @Field({ nullable: true })
    VectorModelID: string | null;

    @Field({ nullable: true })
    ApprovalStatus: string | null;

    @Field({ nullable: true })
    ApprovalFeedback: string | null;

    @Field({ nullable: true })
    GeneratedReplyContent: string | null;

    @Field({ nullable: true })
    ApprovedReplyContent: string | null;

    @Field({ nullable: true })
    ApprovedAt: Date | null;

    @Field({ nullable: true })
    ApprovedByContactID: string | null;

    @Field({ nullable: true })
    GeneratedAt: Date | null;

    @Field({ nullable: true })
    SentAt: Date | null;

    @Field(() => Float, { nullable: true })
    AIConfidenceScore: number | null;

    @Field({ nullable: true })
    AIConfidenceReason: string | null;

    @Field(() => Boolean, { nullable: true })
    AIAutoApproved: boolean | null;

    @Field({ nullable: true })
    AIEvaluatedAt: Date | null;

    @Field({ nullable: true })
    MessageFormat: string | null;

    @Field({ nullable: true })
    SkipCategory: string | null;

    @Field({ nullable: true })
    SkipReasoning: string | null;

    @Field(() => Boolean, { nullable: true })
    IsSpam?: boolean;

    @Field({ nullable: true })
    ErrorType: string | null;

    @Field({ nullable: true })
    ErrorMessage: string | null;

    @Field({ nullable: true })
    SentContent: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Channel Messages
//****************************************************************************
@InputType()
export class UpdateIzzyChannelMessageInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    ChannelRunID?: string | null;

    @Field({ nullable: true })
    ExternalSystemRecordID?: string | null;

    @Field({ nullable: true })
    ReceivedAt?: Date;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    MessageContent?: string;

    @Field(() => Boolean, { nullable: true })
    IsSecure?: boolean;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    ThreadID?: string | null;

    @Field({ nullable: true })
    ContactID?: string | null;

    @Field({ nullable: true })
    Sender?: string;

    @Field({ nullable: true })
    Recipient?: string;

    @Field({ nullable: true })
    GenerationStatus?: string;

    @Field({ nullable: true })
    AIAgentRunID?: string | null;

    @Field({ nullable: true })
    InboundVectorJSON?: string | null;

    @Field({ nullable: true })
    ReplyVectorJSON?: string | null;

    @Field({ nullable: true })
    VectorModelID?: string | null;

    @Field({ nullable: true })
    ApprovalStatus?: string | null;

    @Field({ nullable: true })
    ApprovalFeedback?: string | null;

    @Field({ nullable: true })
    GeneratedReplyContent?: string | null;

    @Field({ nullable: true })
    ApprovedReplyContent?: string | null;

    @Field({ nullable: true })
    ApprovedAt?: Date | null;

    @Field({ nullable: true })
    ApprovedByContactID?: string | null;

    @Field({ nullable: true })
    GeneratedAt?: Date | null;

    @Field({ nullable: true })
    SentAt?: Date | null;

    @Field(() => Float, { nullable: true })
    AIConfidenceScore?: number | null;

    @Field({ nullable: true })
    AIConfidenceReason?: string | null;

    @Field(() => Boolean, { nullable: true })
    AIAutoApproved?: boolean | null;

    @Field({ nullable: true })
    AIEvaluatedAt?: Date | null;

    @Field({ nullable: true })
    MessageFormat?: string | null;

    @Field({ nullable: true })
    SkipCategory?: string | null;

    @Field({ nullable: true })
    SkipReasoning?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsSpam?: boolean;

    @Field({ nullable: true })
    ErrorType?: string | null;

    @Field({ nullable: true })
    ErrorMessage?: string | null;

    @Field({ nullable: true })
    SentContent?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Messages
//****************************************************************************
@ObjectType()
export class RunIzzyChannelMessageViewResult {
    @Field(() => [IzzyChannelMessage_])
    Results: IzzyChannelMessage_[];

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

@Resolver(IzzyChannelMessage_)
export class IzzyChannelMessageResolver extends ResolverBase {
    @Query(() => RunIzzyChannelMessageViewResult)
    async RunIzzyChannelMessageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelMessageViewResult)
    async RunIzzyChannelMessageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelMessageViewResult)
    async RunIzzyChannelMessageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channel Messages';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannelMessage_, { nullable: true })
    async IzzyChannelMessage(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannelMessage_ | null> {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessages] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channel Messages', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannelMessageAttachment_])
    async ChannelMessageAttachments_ChannelMessageIDArray(@Root() izzychannelmessage_: IzzyChannelMessage_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Message Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessageAttachments] WHERE [ChannelMessageID]='${izzychannelmessage_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Message Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Message Attachments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelMessage_])
    async ChannelMessages_ParentIDArray(@Root() izzychannelmessage_: IzzyChannelMessage_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessages] WHERE [ParentID]='${izzychannelmessage_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Messages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyChannelMessage_)
    async CreateIzzyChannelMessage(
        @Arg('input', () => CreateIzzyChannelMessageInput) input: CreateIzzyChannelMessageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channel Messages', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannelMessage_)
    async UpdateIzzyChannelMessage(
        @Arg('input', () => UpdateIzzyChannelMessageInput) input: UpdateIzzyChannelMessageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channel Messages', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannelMessage_)
    async DeleteIzzyChannelMessage(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Messages', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Runs
//****************************************************************************
@ObjectType({ description: `Records of channel polling/processing runs` })
export class IzzyChannelRun_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ChannelID: string;
        
    @Field({description: `When the run started`}) 
    @MaxLength(10)
    StartedAt: Date;
        
    @Field({nullable: true, description: `When the run completed (null if still running)`}) 
    @MaxLength(10)
    CompletedAt?: Date;
        
    @Field({description: `Run status: Running, Completed, Failed, Canceled`}) 
    @MaxLength(100)
    Status: string;
        
    @Field(() => Int, {description: `Total messages found during this run`}) 
    MessageCount: number;
        
    @Field(() => Int, {description: `Messages successfully processed`}) 
    ProcessedCount: number;
        
    @Field(() => Int, {description: `Messages that failed processing`}) 
    FailedCount: number;
        
    @Field({nullable: true, description: `Error message if run failed`}) 
    ErrorMessage?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Channel: string;
        
    @Field(() => [IzzyChannelMessage_])
    ChannelMessages_ChannelRunIDArray: IzzyChannelMessage_[]; // Link to ChannelMessages
    
}

//****************************************************************************
// INPUT TYPE for Channel Runs
//****************************************************************************
@InputType()
export class CreateIzzyChannelRunInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    StartedAt?: Date;

    @Field({ nullable: true })
    CompletedAt: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    MessageCount?: number;

    @Field(() => Int, { nullable: true })
    ProcessedCount?: number;

    @Field(() => Int, { nullable: true })
    FailedCount?: number;

    @Field({ nullable: true })
    ErrorMessage: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Channel Runs
//****************************************************************************
@InputType()
export class UpdateIzzyChannelRunInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    StartedAt?: Date;

    @Field({ nullable: true })
    CompletedAt?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    MessageCount?: number;

    @Field(() => Int, { nullable: true })
    ProcessedCount?: number;

    @Field(() => Int, { nullable: true })
    FailedCount?: number;

    @Field({ nullable: true })
    ErrorMessage?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Runs
//****************************************************************************
@ObjectType()
export class RunIzzyChannelRunViewResult {
    @Field(() => [IzzyChannelRun_])
    Results: IzzyChannelRun_[];

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

@Resolver(IzzyChannelRun_)
export class IzzyChannelRunResolver extends ResolverBase {
    @Query(() => RunIzzyChannelRunViewResult)
    async RunIzzyChannelRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelRunViewResult)
    async RunIzzyChannelRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelRunViewResult)
    async RunIzzyChannelRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channel Runs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannelRun_, { nullable: true })
    async IzzyChannelRun(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannelRun_ | null> {
        this.CheckUserReadPermissions('Channel Runs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelRuns] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Runs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channel Runs', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannelMessage_])
    async ChannelMessages_ChannelRunIDArray(@Root() izzychannelrun_: IzzyChannelRun_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessages] WHERE [ChannelRunID]='${izzychannelrun_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Messages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyChannelRun_)
    async CreateIzzyChannelRun(
        @Arg('input', () => CreateIzzyChannelRunInput) input: CreateIzzyChannelRunInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channel Runs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannelRun_)
    async UpdateIzzyChannelRun(
        @Arg('input', () => UpdateIzzyChannelRunInput) input: UpdateIzzyChannelRunInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channel Runs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannelRun_)
    async DeleteIzzyChannelRun(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Runs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Type Actions
//****************************************************************************
@ObjectType({ description: `Channel type action overrides (middle of inheritance)` })
export class IzzyChannelTypeAction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field() 
    @MaxLength(16)
    ChannelTypeID: string;
        
    @Field() 
    @MaxLength(16)
    ActionID: string;
        
    @Field({description: `Action status at channel type level: Active, Disabled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Int, {description: `Execution order when multiple actions are available`}) 
    Sequence: number;
        
    @Field({nullable: true, description: `JSON configuration for this action at channel type level`}) 
    Configuration?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Reference to the credential used for this action at channel type level`}) 
    @MaxLength(16)
    CredentialID?: string;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(510)
    ChannelType: string;
        
    @Field() 
    @MaxLength(850)
    Action: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Credential?: string;
        
}

//****************************************************************************
// INPUT TYPE for Channel Type Actions
//****************************************************************************
@InputType()
export class CreateIzzyChannelTypeActionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ChannelTypeID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    CredentialID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Channel Type Actions
//****************************************************************************
@InputType()
export class UpdateIzzyChannelTypeActionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ChannelTypeID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    CredentialID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Type Actions
//****************************************************************************
@ObjectType()
export class RunIzzyChannelTypeActionViewResult {
    @Field(() => [IzzyChannelTypeAction_])
    Results: IzzyChannelTypeAction_[];

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

@Resolver(IzzyChannelTypeAction_)
export class IzzyChannelTypeActionResolver extends ResolverBase {
    @Query(() => RunIzzyChannelTypeActionViewResult)
    async RunIzzyChannelTypeActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelTypeActionViewResult)
    async RunIzzyChannelTypeActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelTypeActionViewResult)
    async RunIzzyChannelTypeActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channel Type Actions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannelTypeAction_, { nullable: true })
    async IzzyChannelTypeAction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannelTypeAction_ | null> {
        this.CheckUserReadPermissions('Channel Type Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelTypeActions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Type Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channel Type Actions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyChannelTypeAction_)
    async CreateIzzyChannelTypeAction(
        @Arg('input', () => CreateIzzyChannelTypeActionInput) input: CreateIzzyChannelTypeActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channel Type Actions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannelTypeAction_)
    async UpdateIzzyChannelTypeAction(
        @Arg('input', () => UpdateIzzyChannelTypeActionInput) input: UpdateIzzyChannelTypeActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channel Type Actions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannelTypeAction_)
    async DeleteIzzyChannelTypeAction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Type Actions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Types
//****************************************************************************
@ObjectType({ description: `Types of communication channels (Email, SMS, Chat, etc.)` })
export class IzzyChannelType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Channel type display name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Description of the channel type`}) 
    Description?: string;
        
    @Field() 
    @MaxLength(16)
    CommunicationProviderID: string;
        
    @Field({description: `How actions are inherited: Organization, ChannelType, Combined`}) 
    @MaxLength(40)
    ActionInheritMode: string;
        
    @Field({description: `Channel type status: Active, Pending, Revoked`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    CommunicationProvider: string;
        
    @Field(() => [IzzyChannel_])
    Channels_ChannelTypeIDArray: IzzyChannel_[]; // Link to Channels
    
    @Field(() => [IzzyChannelTypeAction_])
    ChannelTypeActions_ChannelTypeIDArray: IzzyChannelTypeAction_[]; // Link to ChannelTypeActions
    
}

//****************************************************************************
// INPUT TYPE for Channel Types
//****************************************************************************
@InputType()
export class CreateIzzyChannelTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CommunicationProviderID?: string;

    @Field({ nullable: true })
    ActionInheritMode?: string;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Channel Types
//****************************************************************************
@InputType()
export class UpdateIzzyChannelTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CommunicationProviderID?: string;

    @Field({ nullable: true })
    ActionInheritMode?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Types
//****************************************************************************
@ObjectType()
export class RunIzzyChannelTypeViewResult {
    @Field(() => [IzzyChannelType_])
    Results: IzzyChannelType_[];

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

@Resolver(IzzyChannelType_)
export class IzzyChannelTypeResolver extends ResolverBase {
    @Query(() => RunIzzyChannelTypeViewResult)
    async RunIzzyChannelTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelTypeViewResult)
    async RunIzzyChannelTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelTypeViewResult)
    async RunIzzyChannelTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channel Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannelType_, { nullable: true })
    async IzzyChannelType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannelType_ | null> {
        this.CheckUserReadPermissions('Channel Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channel Types', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannel_])
    async Channels_ChannelTypeIDArray(@Root() izzychanneltype_: IzzyChannelType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channels', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannels] WHERE [ChannelTypeID]='${izzychanneltype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channels', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channels', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelTypeAction_])
    async ChannelTypeActions_ChannelTypeIDArray(@Root() izzychanneltype_: IzzyChannelType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Type Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelTypeActions] WHERE [ChannelTypeID]='${izzychanneltype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Type Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Type Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyChannelType_)
    async CreateIzzyChannelType(
        @Arg('input', () => CreateIzzyChannelTypeInput) input: CreateIzzyChannelTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channel Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannelType_)
    async UpdateIzzyChannelType(
        @Arg('input', () => UpdateIzzyChannelTypeInput) input: UpdateIzzyChannelTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channel Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannelType_)
    async DeleteIzzyChannelType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channels
//****************************************************************************
@ObjectType({ description: `Specific communication channels configured for organizations` })
export class IzzyChannel_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field() 
    @MaxLength(16)
    ChannelTypeID: string;
        
    @Field({description: `Channel display name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Description of the channel`}) 
    Description?: string;
        
    @Field({nullable: true, description: `External identifier for this channel (email address, phone number, Slack handle, etc.)`}) 
    ExternalIdentifier?: string;
        
    @Field(() => Int, {nullable: true, description: `How often to check for new messages (in minutes)`}) 
    CheckFrequency?: number;
        
    @Field({description: `How actions are inherited: Organization, ChannelType, Channel, Combined`}) 
    @MaxLength(40)
    ActionInheritMode: string;
        
    @Field({description: `Channel status: Active, Pending, Revoked`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Reference to the credential used for provider authentication`}) 
    @MaxLength(16)
    CredentialID?: string;
        
    @Field({nullable: true, description: `Optional AI configuration override for this channel. If NULL, inherits from organization.`}) 
    @MaxLength(16)
    IzzyAIConfigurationID?: string;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(510)
    ChannelType: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Credential?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    IzzyAIConfiguration?: string;
        
    @Field(() => [IzzyChannelRun_])
    ChannelRuns_ChannelIDArray: IzzyChannelRun_[]; // Link to ChannelRuns
    
    @Field(() => [IzzyOrganizationSetting_])
    OrganizationSettings_ChannelIDArray: IzzyOrganizationSetting_[]; // Link to OrganizationSettings
    
    @Field(() => [IzzyChannelAction_])
    ChannelActions_ChannelIDArray: IzzyChannelAction_[]; // Link to ChannelActions
    
    @Field(() => [IzzyChannelMessage_])
    ChannelMessages_ChannelIDArray: IzzyChannelMessage_[]; // Link to ChannelMessages
    
}

//****************************************************************************
// INPUT TYPE for Channels
//****************************************************************************
@InputType()
export class CreateIzzyChannelInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ChannelTypeID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ExternalIdentifier: string | null;

    @Field(() => Int, { nullable: true })
    CheckFrequency: number | null;

    @Field({ nullable: true })
    ActionInheritMode?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CredentialID: string | null;

    @Field({ nullable: true })
    IzzyAIConfigurationID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Channels
//****************************************************************************
@InputType()
export class UpdateIzzyChannelInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ChannelTypeID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ExternalIdentifier?: string | null;

    @Field(() => Int, { nullable: true })
    CheckFrequency?: number | null;

    @Field({ nullable: true })
    ActionInheritMode?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CredentialID?: string | null;

    @Field({ nullable: true })
    IzzyAIConfigurationID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channels
//****************************************************************************
@ObjectType()
export class RunIzzyChannelViewResult {
    @Field(() => [IzzyChannel_])
    Results: IzzyChannel_[];

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

@Resolver(IzzyChannel_)
export class IzzyChannelResolver extends ResolverBase {
    @Query(() => RunIzzyChannelViewResult)
    async RunIzzyChannelViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelViewResult)
    async RunIzzyChannelViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyChannelViewResult)
    async RunIzzyChannelDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Channels';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyChannel_, { nullable: true })
    async IzzyChannel(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyChannel_ | null> {
        this.CheckUserReadPermissions('Channels', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannels] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channels', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Channels', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannelRun_])
    async ChannelRuns_ChannelIDArray(@Root() izzychannel_: IzzyChannel_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Runs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelRuns] WHERE [ChannelID]='${izzychannel_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Runs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Runs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganizationSetting_])
    async OrganizationSettings_ChannelIDArray(@Root() izzychannel_: IzzyChannel_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Settings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationSettings] WHERE [ChannelID]='${izzychannel_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Settings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Settings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelAction_])
    async ChannelActions_ChannelIDArray(@Root() izzychannel_: IzzyChannel_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelActions] WHERE [ChannelID]='${izzychannel_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelMessage_])
    async ChannelMessages_ChannelIDArray(@Root() izzychannel_: IzzyChannel_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessages] WHERE [ChannelID]='${izzychannel_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Messages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyChannel_)
    async CreateIzzyChannel(
        @Arg('input', () => CreateIzzyChannelInput) input: CreateIzzyChannelInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Channels', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyChannel_)
    async UpdateIzzyChannel(
        @Arg('input', () => UpdateIzzyChannelInput) input: UpdateIzzyChannelInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Channels', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyChannel_)
    async DeleteIzzyChannel(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channels', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Roles
//****************************************************************************
@ObjectType({ description: `Roles that contacts can have within an organization` })
export class IzzyContactRole_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Role display name`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Description of role permissions and responsibilities`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field(() => Int, {description: `Numeric level for role hierarchy (higher = more permissions)`}) 
    Level: number;
        
    @Field(() => Boolean, {description: `Whether this is a system-defined role that cannot be deleted`}) 
    IsSystem: boolean;
        
    @Field({description: `Role status: Active, Inactive`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [IzzyOrganizationContact_])
    OrganizationContacts_RoleIDArray: IzzyOrganizationContact_[]; // Link to OrganizationContacts
    
}

//****************************************************************************
// INPUT TYPE for Contact Roles
//****************************************************************************
@InputType()
export class CreateIzzyContactRoleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    Level?: number;

    @Field(() => Boolean, { nullable: true })
    IsSystem?: boolean;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contact Roles
//****************************************************************************
@InputType()
export class UpdateIzzyContactRoleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    Level?: number;

    @Field(() => Boolean, { nullable: true })
    IsSystem?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Roles
//****************************************************************************
@ObjectType()
export class RunIzzyContactRoleViewResult {
    @Field(() => [IzzyContactRole_])
    Results: IzzyContactRole_[];

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

@Resolver(IzzyContactRole_)
export class IzzyContactRoleResolver extends ResolverBase {
    @Query(() => RunIzzyContactRoleViewResult)
    async RunIzzyContactRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyContactRoleViewResult)
    async RunIzzyContactRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyContactRoleViewResult)
    async RunIzzyContactRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Roles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyContactRole_, { nullable: true })
    async IzzyContactRole(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyContactRole_ | null> {
        this.CheckUserReadPermissions('Contact Roles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwContactRoles] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Roles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Roles', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyOrganizationContact_])
    async OrganizationContacts_RoleIDArray(@Root() izzycontactrole_: IzzyContactRole_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationContacts] WHERE [RoleID]='${izzycontactrole_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyContactRole_)
    async CreateIzzyContactRole(
        @Arg('input', () => CreateIzzyContactRoleInput) input: CreateIzzyContactRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Roles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyContactRole_)
    async UpdateIzzyContactRole(
        @Arg('input', () => UpdateIzzyContactRoleInput) input: UpdateIzzyContactRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Roles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyContactRole_)
    async DeleteIzzyContactRole(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Roles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `Individual users who interact with the Izzy platform` })
export class IzzyContact_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Contact first name`}) 
    @MaxLength(200)
    FirstName: string;
        
    @Field({description: `Contact last name`}) 
    @MaxLength(200)
    LastName: string;
        
    @Field({description: `Contact email address (unique identifier for login)`}) 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true, description: `Job title or position`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `URL to profile image`}) 
    @MaxLength(2048)
    ProfileImageURL?: string;
        
    @Field({description: `Contact status: Active, Pending, Canceled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [IzzyOrganizationContact_])
    OrganizationContacts_ContactIDArray: IzzyOrganizationContact_[]; // Link to OrganizationContacts
    
    @Field(() => [IzzyAPIKey_])
    APIKeys_CreatedByIDArray: IzzyAPIKey_[]; // Link to APIKeys
    
    @Field(() => [IzzyChannelMessage_])
    ChannelMessages_ContactIDArray: IzzyChannelMessage_[]; // Link to ChannelMessages
    
    @Field(() => [IzzyChannelMessage_])
    ChannelMessages_ApprovedByContactIDArray: IzzyChannelMessage_[]; // Link to ChannelMessages
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateIzzyContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    ProfileImageURL: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdateIzzyContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    ProfileImageURL?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunIzzyContactViewResult {
    @Field(() => [IzzyContact_])
    Results: IzzyContact_[];

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

@Resolver(IzzyContact_)
export class IzzyContactResolver extends ResolverBase {
    @Query(() => RunIzzyContactViewResult)
    async RunIzzyContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyContactViewResult)
    async RunIzzyContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyContactViewResult)
    async RunIzzyContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyContact_, { nullable: true })
    async IzzyContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyContact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwContacts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyOrganizationContact_])
    async OrganizationContacts_ContactIDArray(@Root() izzycontact_: IzzyContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationContacts] WHERE [ContactID]='${izzycontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyAPIKey_])
    async APIKeys_CreatedByIDArray(@Root() izzycontact_: IzzyContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('API Keys', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwAPIKeys] WHERE [CreatedByID]='${izzycontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'API Keys', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('API Keys', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelMessage_])
    async ChannelMessages_ContactIDArray(@Root() izzycontact_: IzzyContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessages] WHERE [ContactID]='${izzycontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Messages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelMessage_])
    async ChannelMessages_ApprovedByContactIDArray(@Root() izzycontact_: IzzyContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelMessages] WHERE [ApprovedByContactID]='${izzycontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Messages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyContact_)
    async CreateIzzyContact(
        @Arg('input', () => CreateIzzyContactInput) input: CreateIzzyContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyContact_)
    async UpdateIzzyContact(
        @Arg('input', () => UpdateIzzyContactInput) input: UpdateIzzyContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyContact_)
    async DeleteIzzyContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Credential Types
//****************************************************************************
@ObjectType({ description: `Defines vendor/service types for credentials (e.g., HubSpot, Twilio, Salesforce)` })
export class IzzyCredentialType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({description: `Category of the credential type (CRM, Email, SMS, Helpdesk, etc.)`}) 
    @MaxLength(100)
    Category: string;
        
    @Field({nullable: true, description: `JSON Schema defining required credential fields for this type`}) 
    CredentialSchema?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    IconClass?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field() 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [IzzyCredential_])
    Credentials_TypeIDArray: IzzyCredential_[]; // Link to Credentials
    
}

//****************************************************************************
// INPUT TYPE for Credential Types
//****************************************************************************
@InputType()
export class CreateIzzyCredentialTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    CredentialSchema: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Credential Types
//****************************************************************************
@InputType()
export class UpdateIzzyCredentialTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    CredentialSchema?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Credential Types
//****************************************************************************
@ObjectType()
export class RunIzzyCredentialTypeViewResult {
    @Field(() => [IzzyCredentialType_])
    Results: IzzyCredentialType_[];

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

@Resolver(IzzyCredentialType_)
export class IzzyCredentialTypeResolver extends ResolverBase {
    @Query(() => RunIzzyCredentialTypeViewResult)
    async RunIzzyCredentialTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyCredentialTypeViewResult)
    async RunIzzyCredentialTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyCredentialTypeViewResult)
    async RunIzzyCredentialTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Credential Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyCredentialType_, { nullable: true })
    async IzzyCredentialType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyCredentialType_ | null> {
        this.CheckUserReadPermissions('Credential Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwCredentialTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Credential Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Credential Types', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyCredential_])
    async Credentials_TypeIDArray(@Root() izzycredentialtype_: IzzyCredentialType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Credentials', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwCredentials] WHERE [TypeID]='${izzycredentialtype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Credentials', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Credentials', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyCredentialType_)
    async CreateIzzyCredentialType(
        @Arg('input', () => CreateIzzyCredentialTypeInput) input: CreateIzzyCredentialTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Credential Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyCredentialType_)
    async UpdateIzzyCredentialType(
        @Arg('input', () => UpdateIzzyCredentialTypeInput) input: UpdateIzzyCredentialTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Credential Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyCredentialType_)
    async DeleteIzzyCredentialType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Credential Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Credentials
//****************************************************************************
@ObjectType({ description: `Organization-scoped credentials linked to a credential type` })
export class IzzyCredential_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field() 
    @MaxLength(16)
    TypeID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true, description: `AES-256-GCM encrypted credentials JSON`}) 
    EncryptedCredentials?: string;
        
    @Field({nullable: true, description: `Human-readable notes about the credentials (not encrypted)`}) 
    @MaxLength(1000)
    CredentialNotes?: string;
        
    @Field() 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `When the credential expires (for OAuth tokens, API keys with expiry, etc.)`}) 
    @MaxLength(10)
    ExpiresAt?: Date;
        
    @Field({nullable: true, description: `Timestamp of last credential usage for auditing`}) 
    @MaxLength(10)
    LastUsedAt?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(200)
    Type: string;
        
    @Field(() => [IzzyChannelAction_])
    ChannelActions_CredentialIDArray: IzzyChannelAction_[]; // Link to ChannelActions
    
    @Field(() => [IzzyOrganizationAction_])
    OrganizationActions_CredentialIDArray: IzzyOrganizationAction_[]; // Link to OrganizationActions
    
    @Field(() => [IzzyChannelTypeAction_])
    ChannelTypeActions_CredentialIDArray: IzzyChannelTypeAction_[]; // Link to ChannelTypeActions
    
    @Field(() => [IzzyChannel_])
    Channels_CredentialIDArray: IzzyChannel_[]; // Link to Channels
    
}

//****************************************************************************
// INPUT TYPE for Credentials
//****************************************************************************
@InputType()
export class CreateIzzyCredentialInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    TypeID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    EncryptedCredentials: string | null;

    @Field({ nullable: true })
    CredentialNotes: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt: Date | null;

    @Field({ nullable: true })
    LastUsedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Credentials
//****************************************************************************
@InputType()
export class UpdateIzzyCredentialInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    TypeID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    EncryptedCredentials?: string | null;

    @Field({ nullable: true })
    CredentialNotes?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date | null;

    @Field({ nullable: true })
    LastUsedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Credentials
//****************************************************************************
@ObjectType()
export class RunIzzyCredentialViewResult {
    @Field(() => [IzzyCredential_])
    Results: IzzyCredential_[];

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

@Resolver(IzzyCredential_)
export class IzzyCredentialResolver extends ResolverBase {
    @Query(() => RunIzzyCredentialViewResult)
    async RunIzzyCredentialViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyCredentialViewResult)
    async RunIzzyCredentialViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyCredentialViewResult)
    async RunIzzyCredentialDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Credentials';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyCredential_, { nullable: true })
    async IzzyCredential(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyCredential_ | null> {
        this.CheckUserReadPermissions('Credentials', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwCredentials] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Credentials', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Credentials', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannelAction_])
    async ChannelActions_CredentialIDArray(@Root() izzycredential_: IzzyCredential_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelActions] WHERE [CredentialID]='${izzycredential_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganizationAction_])
    async OrganizationActions_CredentialIDArray(@Root() izzycredential_: IzzyCredential_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationActions] WHERE [CredentialID]='${izzycredential_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelTypeAction_])
    async ChannelTypeActions_CredentialIDArray(@Root() izzycredential_: IzzyCredential_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Type Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelTypeActions] WHERE [CredentialID]='${izzycredential_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Type Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Type Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannel_])
    async Channels_CredentialIDArray(@Root() izzycredential_: IzzyCredential_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channels', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannels] WHERE [CredentialID]='${izzycredential_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channels', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channels', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyCredential_)
    async CreateIzzyCredential(
        @Arg('input', () => CreateIzzyCredentialInput) input: CreateIzzyCredentialInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Credentials', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyCredential_)
    async UpdateIzzyCredential(
        @Arg('input', () => UpdateIzzyCredentialInput) input: UpdateIzzyCredentialInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Credentials', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyCredential_)
    async DeleteIzzyCredential(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Credentials', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Flyway _schema _histories__Izzy
//****************************************************************************
@ObjectType()
export class Izzyflywayschemahistory_ {
    @Field(() => Int) 
    installed_rank: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    version?: string;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    description?: string;
        
    @Field() 
    @MaxLength(40)
    type: string;
        
    @Field() 
    @MaxLength(2000)
    script: string;
        
    @Field(() => Int, {nullable: true}) 
    checksum?: number;
        
    @Field() 
    @MaxLength(200)
    installed_by: string;
        
    @Field() 
    @MaxLength(8)
    installed_on: Date;
        
    @Field(() => Int) 
    execution_time: number;
        
    @Field(() => Boolean) 
    success: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Flyway _schema _histories__Izzy
//****************************************************************************
@InputType()
export class CreateIzzyflywayschemahistoryInput {
    @Field(() => Int, { nullable: true })
    installed_rank?: number;

    @Field({ nullable: true })
    version: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field({ nullable: true })
    type?: string;

    @Field({ nullable: true })
    script?: string;

    @Field(() => Int, { nullable: true })
    checksum: number | null;

    @Field({ nullable: true })
    installed_by?: string;

    @Field({ nullable: true })
    installed_on?: Date;

    @Field(() => Int, { nullable: true })
    execution_time?: number;

    @Field(() => Boolean, { nullable: true })
    success?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Flyway _schema _histories__Izzy
//****************************************************************************
@InputType()
export class UpdateIzzyflywayschemahistoryInput {
    @Field(() => Int)
    installed_rank: number;

    @Field({ nullable: true })
    version?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field({ nullable: true })
    type?: string;

    @Field({ nullable: true })
    script?: string;

    @Field(() => Int, { nullable: true })
    checksum?: number | null;

    @Field({ nullable: true })
    installed_by?: string;

    @Field({ nullable: true })
    installed_on?: Date;

    @Field(() => Int, { nullable: true })
    execution_time?: number;

    @Field(() => Boolean, { nullable: true })
    success?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Flyway _schema _histories__Izzy
//****************************************************************************
@ObjectType()
export class RunIzzyflywayschemahistoryViewResult {
    @Field(() => [Izzyflywayschemahistory_])
    Results: Izzyflywayschemahistory_[];

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

@Resolver(Izzyflywayschemahistory_)
export class IzzyflywayschemahistoryResolver extends ResolverBase {
    @Query(() => RunIzzyflywayschemahistoryViewResult)
    async RunIzzyflywayschemahistoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyflywayschemahistoryViewResult)
    async RunIzzyflywayschemahistoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyflywayschemahistoryViewResult)
    async RunIzzyflywayschemahistoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Flyway _schema _histories__Izzy';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Izzyflywayschemahistory_, { nullable: true })
    async Izzyflywayschemahistory(@Arg('installed_rank', () => Int) installed_rank: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Izzyflywayschemahistory_ | null> {
        this.CheckUserReadPermissions('Flyway _schema _histories__Izzy', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwFlyway_schema_histories__Izzy] WHERE [installed_rank]=${installed_rank} ` + this.getRowLevelSecurityWhereClause(provider, 'Flyway _schema _histories__Izzy', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Flyway _schema _histories__Izzy', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => Izzyflywayschemahistory_)
    async CreateIzzyflywayschemahistory(
        @Arg('input', () => CreateIzzyflywayschemahistoryInput) input: CreateIzzyflywayschemahistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Flyway _schema _histories__Izzy', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Izzyflywayschemahistory_)
    async UpdateIzzyflywayschemahistory(
        @Arg('input', () => UpdateIzzyflywayschemahistoryInput) input: UpdateIzzyflywayschemahistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Flyway _schema _histories__Izzy', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Izzyflywayschemahistory_)
    async DeleteIzzyflywayschemahistory(@Arg('installed_rank', () => Int) installed_rank: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'installed_rank', Value: installed_rank}]);
        return this.DeleteRecord('Flyway _schema _histories__Izzy', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Izzy Action Categories
//****************************************************************************
@ObjectType({ description: `Hierarchical categories for organizing actions in the gallery` })
export class IzzyIzzyActionCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Category display name`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Description of actions in this category`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentID?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(200)
    IconClass?: string;
        
    @Field(() => Int, {description: `Display order within parent category`}) 
    SortOrder: number;
        
    @Field({description: `Category status: Active, Inactive`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentID?: string;
        
    @Field(() => [IzzyIzzyActionCategory_])
    IzzyActionCategories_ParentIDArray: IzzyIzzyActionCategory_[]; // Link to IzzyActionCategories
    
    @Field(() => [IzzyIzzyAction_])
    IzzyActions_CategoryIDArray: IzzyIzzyAction_[]; // Link to IzzyActions
    
}

//****************************************************************************
// INPUT TYPE for Izzy Action Categories
//****************************************************************************
@InputType()
export class CreateIzzyIzzyActionCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Izzy Action Categories
//****************************************************************************
@InputType()
export class UpdateIzzyIzzyActionCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Izzy Action Categories
//****************************************************************************
@ObjectType()
export class RunIzzyIzzyActionCategoryViewResult {
    @Field(() => [IzzyIzzyActionCategory_])
    Results: IzzyIzzyActionCategory_[];

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

@Resolver(IzzyIzzyActionCategory_)
export class IzzyIzzyActionCategoryResolver extends ResolverBase {
    @Query(() => RunIzzyIzzyActionCategoryViewResult)
    async RunIzzyIzzyActionCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyActionCategoryViewResult)
    async RunIzzyIzzyActionCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyActionCategoryViewResult)
    async RunIzzyIzzyActionCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Izzy Action Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyIzzyActionCategory_, { nullable: true })
    async IzzyIzzyActionCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyIzzyActionCategory_ | null> {
        this.CheckUserReadPermissions('Izzy Action Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActionCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Action Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Izzy Action Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyIzzyActionCategory_])
    async IzzyActionCategories_ParentIDArray(@Root() izzyizzyactioncategory_: IzzyIzzyActionCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Izzy Action Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActionCategories] WHERE [ParentID]='${izzyizzyactioncategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Action Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Izzy Action Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyIzzyAction_])
    async IzzyActions_CategoryIDArray(@Root() izzyizzyactioncategory_: IzzyIzzyActionCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Izzy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActions] WHERE [CategoryID]='${izzyizzyactioncategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Izzy Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyIzzyActionCategory_)
    async CreateIzzyIzzyActionCategory(
        @Arg('input', () => CreateIzzyIzzyActionCategoryInput) input: CreateIzzyIzzyActionCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Izzy Action Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyIzzyActionCategory_)
    async UpdateIzzyIzzyActionCategory(
        @Arg('input', () => UpdateIzzyIzzyActionCategoryInput) input: UpdateIzzyIzzyActionCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Izzy Action Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyIzzyActionCategory_)
    async DeleteIzzyIzzyActionCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Izzy Action Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Izzy Action Organizations
//****************************************************************************
@ObjectType({ description: `Grants private actions to specific organizations` })
export class IzzyIzzyActionOrganization_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    IzzyActionID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field({description: `Grant status: Active, Revoked`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({description: `When the action was granted to this organization`}) 
    @MaxLength(10)
    GrantedAt: Date;
        
    @Field({nullable: true, description: `When this grant expires (null = never)`}) 
    @MaxLength(10)
    ExpiresAt?: Date;
        
    @Field({nullable: true, description: `Admin notes about why this was granted`}) 
    @MaxLength(1000)
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    IzzyAction: string;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
}

//****************************************************************************
// INPUT TYPE for Izzy Action Organizations
//****************************************************************************
@InputType()
export class CreateIzzyIzzyActionOrganizationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    IzzyActionID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    GrantedAt?: Date;

    @Field({ nullable: true })
    ExpiresAt: Date | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Izzy Action Organizations
//****************************************************************************
@InputType()
export class UpdateIzzyIzzyActionOrganizationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    IzzyActionID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    GrantedAt?: Date;

    @Field({ nullable: true })
    ExpiresAt?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Izzy Action Organizations
//****************************************************************************
@ObjectType()
export class RunIzzyIzzyActionOrganizationViewResult {
    @Field(() => [IzzyIzzyActionOrganization_])
    Results: IzzyIzzyActionOrganization_[];

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

@Resolver(IzzyIzzyActionOrganization_)
export class IzzyIzzyActionOrganizationResolver extends ResolverBase {
    @Query(() => RunIzzyIzzyActionOrganizationViewResult)
    async RunIzzyIzzyActionOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyActionOrganizationViewResult)
    async RunIzzyIzzyActionOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyActionOrganizationViewResult)
    async RunIzzyIzzyActionOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Izzy Action Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyIzzyActionOrganization_, { nullable: true })
    async IzzyIzzyActionOrganization(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyIzzyActionOrganization_ | null> {
        this.CheckUserReadPermissions('Izzy Action Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActionOrganizations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Action Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Izzy Action Organizations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyIzzyActionOrganization_)
    async CreateIzzyIzzyActionOrganization(
        @Arg('input', () => CreateIzzyIzzyActionOrganizationInput) input: CreateIzzyIzzyActionOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Izzy Action Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyIzzyActionOrganization_)
    async UpdateIzzyIzzyActionOrganization(
        @Arg('input', () => UpdateIzzyIzzyActionOrganizationInput) input: UpdateIzzyIzzyActionOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Izzy Action Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyIzzyActionOrganization_)
    async DeleteIzzyIzzyActionOrganization(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Izzy Action Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Izzy Actions
//****************************************************************************
@ObjectType({ description: `Master list of actions available in the Izzy platform` })
export class IzzyIzzyAction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ActionID: string;
        
    @Field({description: `Display name for the action`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of what the action does`}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CategoryID?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(200)
    IconClass?: string;
        
    @Field({description: `Action status: Active, Deprecated, Coming Soon`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Boolean, {description: `Whether this action is available to all orgs (vs private)`}) 
    IsPublic: boolean;
        
    @Field(() => Int, {description: `Minimum plan level required to use this action`}) 
    MinimumPlanLevel: number;
        
    @Field(() => Boolean, {description: `Whether this action requires credentials to be configured`}) 
    RequiresCredentials: boolean;
        
    @Field({nullable: true, description: `JSON Schema defining required credential fields`}) 
    CredentialSchema?: string;
        
    @Field({nullable: true, description: `JSON Schema defining configuration options`}) 
    ConfigurationSchema?: string;
        
    @Field({nullable: true, description: `URL to action documentation`}) 
    @MaxLength(2048)
    DocumentationURL?: string;
        
    @Field(() => Int, {description: `Display order within category`}) 
    SortOrder: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(850)
    Action: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => [IzzyIzzyActionOrganization_])
    IzzyActionOrganizations_IzzyActionIDArray: IzzyIzzyActionOrganization_[]; // Link to IzzyActionOrganizations
    
}

//****************************************************************************
// INPUT TYPE for Izzy Actions
//****************************************************************************
@InputType()
export class CreateIzzyIzzyActionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CategoryID: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsPublic?: boolean;

    @Field(() => Int, { nullable: true })
    MinimumPlanLevel?: number;

    @Field(() => Boolean, { nullable: true })
    RequiresCredentials?: boolean;

    @Field({ nullable: true })
    CredentialSchema: string | null;

    @Field({ nullable: true })
    ConfigurationSchema: string | null;

    @Field({ nullable: true })
    DocumentationURL: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;
}
    

//****************************************************************************
// INPUT TYPE for Izzy Actions
//****************************************************************************
@InputType()
export class UpdateIzzyIzzyActionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CategoryID?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsPublic?: boolean;

    @Field(() => Int, { nullable: true })
    MinimumPlanLevel?: number;

    @Field(() => Boolean, { nullable: true })
    RequiresCredentials?: boolean;

    @Field({ nullable: true })
    CredentialSchema?: string | null;

    @Field({ nullable: true })
    ConfigurationSchema?: string | null;

    @Field({ nullable: true })
    DocumentationURL?: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Izzy Actions
//****************************************************************************
@ObjectType()
export class RunIzzyIzzyActionViewResult {
    @Field(() => [IzzyIzzyAction_])
    Results: IzzyIzzyAction_[];

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

@Resolver(IzzyIzzyAction_)
export class IzzyIzzyActionResolver extends ResolverBase {
    @Query(() => RunIzzyIzzyActionViewResult)
    async RunIzzyIzzyActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyActionViewResult)
    async RunIzzyIzzyActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyActionViewResult)
    async RunIzzyIzzyActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Izzy Actions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyIzzyAction_, { nullable: true })
    async IzzyIzzyAction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyIzzyAction_ | null> {
        this.CheckUserReadPermissions('Izzy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Izzy Actions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyIzzyActionOrganization_])
    async IzzyActionOrganizations_IzzyActionIDArray(@Root() izzyizzyaction_: IzzyIzzyAction_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Izzy Action Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActionOrganizations] WHERE [IzzyActionID]='${izzyizzyaction_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Action Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Izzy Action Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyIzzyAction_)
    async CreateIzzyIzzyAction(
        @Arg('input', () => CreateIzzyIzzyActionInput) input: CreateIzzyIzzyActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Izzy Actions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyIzzyAction_)
    async UpdateIzzyIzzyAction(
        @Arg('input', () => UpdateIzzyIzzyActionInput) input: UpdateIzzyIzzyActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Izzy Actions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyIzzyAction_)
    async DeleteIzzyIzzyAction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Izzy Actions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Izzy AI Configurations
//****************************************************************************
@ObjectType({ description: `Izzy-specific wrapper around MJ AI Configurations. Adds plan-level restrictions and expiration for multi-tenant scenarios.` })
export class IzzyIzzyAIConfiguration_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name for this AI configuration (e.g., "Groq/Cerebras Fast", "Anthropic Premium")`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({description: `Foreign key to MJ AI Configuration which defines the actual model/vendor assignments`}) 
    @MaxLength(16)
    AIConfigurationID: string;
        
    @Field({nullable: true, description: `Minimum subscription plan level required to use this configuration (e.g., Free, Pro, Enterprise). NULL means available to all.`}) 
    @MaxLength(100)
    MinPlanLevel?: string;
        
    @Field({nullable: true, description: `When this configuration expires and becomes unavailable. NULL means never expires.`}) 
    @MaxLength(10)
    ExpiresAt?: Date;
        
    @Field() 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    AIConfiguration: string;
        
    @Field(() => [IzzyChannel_])
    Channels_IzzyAIConfigurationIDArray: IzzyChannel_[]; // Link to Channels
    
    @Field(() => [IzzyOrganization_])
    Organizations_IzzyAIConfigurationIDArray: IzzyOrganization_[]; // Link to Organizations
    
}

//****************************************************************************
// INPUT TYPE for Izzy AI Configurations
//****************************************************************************
@InputType()
export class CreateIzzyIzzyAIConfigurationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    AIConfigurationID?: string;

    @Field({ nullable: true })
    MinPlanLevel: string | null;

    @Field({ nullable: true })
    ExpiresAt: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;
}
    

//****************************************************************************
// INPUT TYPE for Izzy AI Configurations
//****************************************************************************
@InputType()
export class UpdateIzzyIzzyAIConfigurationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    AIConfigurationID?: string;

    @Field({ nullable: true })
    MinPlanLevel?: string | null;

    @Field({ nullable: true })
    ExpiresAt?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Izzy AI Configurations
//****************************************************************************
@ObjectType()
export class RunIzzyIzzyAIConfigurationViewResult {
    @Field(() => [IzzyIzzyAIConfiguration_])
    Results: IzzyIzzyAIConfiguration_[];

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

@Resolver(IzzyIzzyAIConfiguration_)
export class IzzyIzzyAIConfigurationResolver extends ResolverBase {
    @Query(() => RunIzzyIzzyAIConfigurationViewResult)
    async RunIzzyIzzyAIConfigurationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyAIConfigurationViewResult)
    async RunIzzyIzzyAIConfigurationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyIzzyAIConfigurationViewResult)
    async RunIzzyIzzyAIConfigurationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Izzy AI Configurations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyIzzyAIConfiguration_, { nullable: true })
    async IzzyIzzyAIConfiguration(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyIzzyAIConfiguration_ | null> {
        this.CheckUserReadPermissions('Izzy AI Configurations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyAIConfigurations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy AI Configurations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Izzy AI Configurations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannel_])
    async Channels_IzzyAIConfigurationIDArray(@Root() izzyizzyaiconfiguration_: IzzyIzzyAIConfiguration_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channels', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannels] WHERE [IzzyAIConfigurationID]='${izzyizzyaiconfiguration_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channels', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channels', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganization_])
    async Organizations_IzzyAIConfigurationIDArray(@Root() izzyizzyaiconfiguration_: IzzyIzzyAIConfiguration_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizations] WHERE [IzzyAIConfigurationID]='${izzyizzyaiconfiguration_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyIzzyAIConfiguration_)
    async CreateIzzyIzzyAIConfiguration(
        @Arg('input', () => CreateIzzyIzzyAIConfigurationInput) input: CreateIzzyIzzyAIConfigurationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Izzy AI Configurations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyIzzyAIConfiguration_)
    async UpdateIzzyIzzyAIConfiguration(
        @Arg('input', () => UpdateIzzyIzzyAIConfigurationInput) input: UpdateIzzyIzzyAIConfigurationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Izzy AI Configurations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyIzzyAIConfiguration_)
    async DeleteIzzyIzzyAIConfiguration(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Izzy AI Configurations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organization Actions
//****************************************************************************
@ObjectType({ description: `Organization-level action configuration (top of inheritance)` })
export class IzzyOrganizationAction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field() 
    @MaxLength(16)
    ActionID: string;
        
    @Field({description: `Action status at org level: Active, Disabled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Int, {description: `Execution order when multiple actions are available`}) 
    Sequence: number;
        
    @Field({nullable: true, description: `JSON configuration for this action at org level`}) 
    Configuration?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Reference to the credential used for this action at org level`}) 
    @MaxLength(16)
    CredentialID?: string;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(850)
    Action: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Credential?: string;
        
}

//****************************************************************************
// INPUT TYPE for Organization Actions
//****************************************************************************
@InputType()
export class CreateIzzyOrganizationActionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    CredentialID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organization Actions
//****************************************************************************
@InputType()
export class UpdateIzzyOrganizationActionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    CredentialID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organization Actions
//****************************************************************************
@ObjectType()
export class RunIzzyOrganizationActionViewResult {
    @Field(() => [IzzyOrganizationAction_])
    Results: IzzyOrganizationAction_[];

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

@Resolver(IzzyOrganizationAction_)
export class IzzyOrganizationActionResolver extends ResolverBase {
    @Query(() => RunIzzyOrganizationActionViewResult)
    async RunIzzyOrganizationActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationActionViewResult)
    async RunIzzyOrganizationActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationActionViewResult)
    async RunIzzyOrganizationActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organization Actions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyOrganizationAction_, { nullable: true })
    async IzzyOrganizationAction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyOrganizationAction_ | null> {
        this.CheckUserReadPermissions('Organization Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationActions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organization Actions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyOrganizationAction_)
    async CreateIzzyOrganizationAction(
        @Arg('input', () => CreateIzzyOrganizationActionInput) input: CreateIzzyOrganizationActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organization Actions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyOrganizationAction_)
    async UpdateIzzyOrganizationAction(
        @Arg('input', () => UpdateIzzyOrganizationActionInput) input: UpdateIzzyOrganizationActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organization Actions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyOrganizationAction_)
    async DeleteIzzyOrganizationAction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organization Actions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organization Contacts
//****************************************************************************
@ObjectType({ description: `Links contacts to organizations with specific roles` })
export class IzzyOrganizationContact_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field() 
    @MaxLength(16)
    ContactID: string;
        
    @Field() 
    @MaxLength(16)
    RoleID: string;
        
    @Field({description: `Membership status: Active, Pending, Revoked`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(510)
    Contact: string;
        
    @Field() 
    @MaxLength(200)
    Role: string;
        
}

//****************************************************************************
// INPUT TYPE for Organization Contacts
//****************************************************************************
@InputType()
export class CreateIzzyOrganizationContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    RoleID?: string;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Organization Contacts
//****************************************************************************
@InputType()
export class UpdateIzzyOrganizationContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    RoleID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organization Contacts
//****************************************************************************
@ObjectType()
export class RunIzzyOrganizationContactViewResult {
    @Field(() => [IzzyOrganizationContact_])
    Results: IzzyOrganizationContact_[];

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

@Resolver(IzzyOrganizationContact_)
export class IzzyOrganizationContactResolver extends ResolverBase {
    @Query(() => RunIzzyOrganizationContactViewResult)
    async RunIzzyOrganizationContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationContactViewResult)
    async RunIzzyOrganizationContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationContactViewResult)
    async RunIzzyOrganizationContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organization Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyOrganizationContact_, { nullable: true })
    async IzzyOrganizationContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyOrganizationContact_ | null> {
        this.CheckUserReadPermissions('Organization Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationContacts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organization Contacts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyOrganizationContact_)
    async CreateIzzyOrganizationContact(
        @Arg('input', () => CreateIzzyOrganizationContactInput) input: CreateIzzyOrganizationContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organization Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyOrganizationContact_)
    async UpdateIzzyOrganizationContact(
        @Arg('input', () => UpdateIzzyOrganizationContactInput) input: UpdateIzzyOrganizationContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organization Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyOrganizationContact_)
    async DeleteIzzyOrganizationContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organization Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organization Settings
//****************************************************************************
@ObjectType({ description: `Organization-specific setting values` })
export class IzzyOrganizationSetting_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrganizationID: string;
        
    @Field() 
    @MaxLength(16)
    SettingID: string;
        
    @Field({nullable: true, description: `The setting value for this organization`}) 
    Value?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({description: `Scope of the setting: Organization (applies to all channels in org) or Channel (specific to one channel)`}) 
    @MaxLength(40)
    Scope: string;
        
    @Field({nullable: true, description: `Optional Channel ID for channel-scoped settings. Required when Scope = Channel, must be NULL when Scope = Organization`}) 
    @MaxLength(16)
    ChannelID?: string;
        
    @Field() 
    @MaxLength(510)
    Organization: string;
        
    @Field() 
    @MaxLength(510)
    Setting: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Channel?: string;
        
}

//****************************************************************************
// INPUT TYPE for Organization Settings
//****************************************************************************
@InputType()
export class CreateIzzyOrganizationSettingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    SettingID?: string;

    @Field({ nullable: true })
    Value: string | null;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    ChannelID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organization Settings
//****************************************************************************
@InputType()
export class UpdateIzzyOrganizationSettingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    SettingID?: string;

    @Field({ nullable: true })
    Value?: string | null;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    ChannelID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organization Settings
//****************************************************************************
@ObjectType()
export class RunIzzyOrganizationSettingViewResult {
    @Field(() => [IzzyOrganizationSetting_])
    Results: IzzyOrganizationSetting_[];

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

@Resolver(IzzyOrganizationSetting_)
export class IzzyOrganizationSettingResolver extends ResolverBase {
    @Query(() => RunIzzyOrganizationSettingViewResult)
    async RunIzzyOrganizationSettingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationSettingViewResult)
    async RunIzzyOrganizationSettingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationSettingViewResult)
    async RunIzzyOrganizationSettingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organization Settings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyOrganizationSetting_, { nullable: true })
    async IzzyOrganizationSetting(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyOrganizationSetting_ | null> {
        this.CheckUserReadPermissions('Organization Settings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationSettings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Settings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organization Settings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => IzzyOrganizationSetting_)
    async CreateIzzyOrganizationSetting(
        @Arg('input', () => CreateIzzyOrganizationSettingInput) input: CreateIzzyOrganizationSettingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organization Settings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyOrganizationSetting_)
    async UpdateIzzyOrganizationSetting(
        @Arg('input', () => UpdateIzzyOrganizationSettingInput) input: UpdateIzzyOrganizationSettingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organization Settings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyOrganizationSetting_)
    async DeleteIzzyOrganizationSetting(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organization Settings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organizations
//****************************************************************************
@ObjectType({ description: `Customer organizations using the Izzy platform` })
export class IzzyOrganization_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Organization display name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Optional description of the organization`}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    PlanID?: string;
        
    @Field({description: `Organization status: Active, Pending, Revoked`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Default AI configuration for this organization. Inherited by sub-orgs and channels unless overridden.`}) 
    @MaxLength(16)
    IzzyAIConfigurationID?: string;
        
    @Field({nullable: true, description: `Primary email domain for the organization (e.g., meetizzy.ai). Used for user auto-association and internal org identification.`}) 
    @MaxLength(510)
    Domain?: string;
        
    @Field({nullable: true, description: `Logo image for the organization. Can be a base64-encoded data URL or an external image URL.`}) 
    LogoURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Plan?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    IzzyAIConfiguration?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentID?: string;
        
    @Field(() => [IzzyChannel_])
    Channels_OrganizationIDArray: IzzyChannel_[]; // Link to Channels
    
    @Field(() => [IzzyAPIKey_])
    APIKeys_OrganizationIDArray: IzzyAPIKey_[]; // Link to APIKeys
    
    @Field(() => [IzzyOrganization_])
    Organizations_ParentIDArray: IzzyOrganization_[]; // Link to Organizations
    
    @Field(() => [IzzyIzzyActionOrganization_])
    IzzyActionOrganizations_OrganizationIDArray: IzzyIzzyActionOrganization_[]; // Link to IzzyActionOrganizations
    
    @Field(() => [IzzyOrganizationSetting_])
    OrganizationSettings_OrganizationIDArray: IzzyOrganizationSetting_[]; // Link to OrganizationSettings
    
    @Field(() => [IzzyOrganizationAction_])
    OrganizationActions_OrganizationIDArray: IzzyOrganizationAction_[]; // Link to OrganizationActions
    
    @Field(() => [IzzyCredential_])
    Credentials_OrganizationIDArray: IzzyCredential_[]; // Link to Credentials
    
    @Field(() => [IzzyOrganizationContact_])
    OrganizationContacts_OrganizationIDArray: IzzyOrganizationContact_[]; // Link to OrganizationContacts
    
    @Field(() => [IzzyChannelTypeAction_])
    ChannelTypeActions_OrganizationIDArray: IzzyChannelTypeAction_[]; // Link to ChannelTypeActions
    
}

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class CreateIzzyOrganizationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    PlanID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    IzzyAIConfigurationID: string | null;

    @Field({ nullable: true })
    Domain: string | null;

    @Field({ nullable: true })
    LogoURL: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class UpdateIzzyOrganizationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    PlanID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    IzzyAIConfigurationID?: string | null;

    @Field({ nullable: true })
    Domain?: string | null;

    @Field({ nullable: true })
    LogoURL?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organizations
//****************************************************************************
@ObjectType()
export class RunIzzyOrganizationViewResult {
    @Field(() => [IzzyOrganization_])
    Results: IzzyOrganization_[];

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

@Resolver(IzzyOrganization_)
export class IzzyOrganizationResolver extends ResolverBase {
    @Query(() => RunIzzyOrganizationViewResult)
    async RunIzzyOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationViewResult)
    async RunIzzyOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyOrganizationViewResult)
    async RunIzzyOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyOrganization_, { nullable: true })
    async IzzyOrganization(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyOrganization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organizations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyChannel_])
    async Channels_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channels', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannels] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channels', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channels', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyAPIKey_])
    async APIKeys_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('API Keys', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwAPIKeys] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'API Keys', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('API Keys', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganization_])
    async Organizations_ParentIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizations] WHERE [ParentID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyIzzyActionOrganization_])
    async IzzyActionOrganizations_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Izzy Action Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwIzzyActionOrganizations] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Izzy Action Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Izzy Action Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganizationSetting_])
    async OrganizationSettings_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Settings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationSettings] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Settings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Settings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganizationAction_])
    async OrganizationActions_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationActions] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyCredential_])
    async Credentials_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Credentials', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwCredentials] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Credentials', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Credentials', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyOrganizationContact_])
    async OrganizationContacts_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationContacts] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzyChannelTypeAction_])
    async ChannelTypeActions_OrganizationIDArray(@Root() izzyorganization_: IzzyOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Type Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwChannelTypeActions] WHERE [OrganizationID]='${izzyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Channel Type Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Channel Type Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyOrganization_)
    async CreateIzzyOrganization(
        @Arg('input', () => CreateIzzyOrganizationInput) input: CreateIzzyOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyOrganization_)
    async UpdateIzzyOrganization(
        @Arg('input', () => UpdateIzzyOrganizationInput) input: UpdateIzzyOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyOrganization_)
    async DeleteIzzyOrganization(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Plans
//****************************************************************************
@ObjectType({ description: `SaaS subscription tiers defining feature access levels` })
export class IzzyPlan_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the plan`}) 
    @MaxLength(100)
    Name: string;
        
    @Field(() => Int, {description: `Numeric level for plan comparison (higher = more features)`}) 
    Level: number;
        
    @Field({nullable: true, description: `Description of plan features and benefits`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field(() => Float, {nullable: true, description: `Monthly subscription price`}) 
    MonthlyPrice?: number;
        
    @Field(() => Float, {nullable: true, description: `Annual subscription price (typically discounted)`}) 
    AnnualPrice?: number;
        
    @Field({description: `Plan status: Active, Inactive`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [IzzyOrganization_])
    Organizations_PlanIDArray: IzzyOrganization_[]; // Link to Organizations
    
}

//****************************************************************************
// INPUT TYPE for Plans
//****************************************************************************
@InputType()
export class CreateIzzyPlanInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    Level?: number;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    MonthlyPrice: number | null;

    @Field(() => Float, { nullable: true })
    AnnualPrice: number | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Plans
//****************************************************************************
@InputType()
export class UpdateIzzyPlanInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    Level?: number;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    MonthlyPrice?: number | null;

    @Field(() => Float, { nullable: true })
    AnnualPrice?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Plans
//****************************************************************************
@ObjectType()
export class RunIzzyPlanViewResult {
    @Field(() => [IzzyPlan_])
    Results: IzzyPlan_[];

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

@Resolver(IzzyPlan_)
export class IzzyPlanResolver extends ResolverBase {
    @Query(() => RunIzzyPlanViewResult)
    async RunIzzyPlanViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyPlanViewResult)
    async RunIzzyPlanViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyPlanViewResult)
    async RunIzzyPlanDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Plans';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyPlan_, { nullable: true })
    async IzzyPlan(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyPlan_ | null> {
        this.CheckUserReadPermissions('Plans', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwPlans] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Plans', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Plans', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyOrganization_])
    async Organizations_PlanIDArray(@Root() izzyplan_: IzzyPlan_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizations] WHERE [PlanID]='${izzyplan_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyPlan_)
    async CreateIzzyPlan(
        @Arg('input', () => CreateIzzyPlanInput) input: CreateIzzyPlanInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Plans', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyPlan_)
    async UpdateIzzyPlan(
        @Arg('input', () => UpdateIzzyPlanInput) input: UpdateIzzyPlanInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Plans', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyPlan_)
    async DeleteIzzyPlan(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Plans', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Scopes
//****************************************************************************
@ObjectType({ description: `API permission scopes for access control` })
export class IzzyScope_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Scope identifier (e.g., messages:read)`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Human-readable description of what this scope allows`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [IzzyAPIKeyScope_])
    APIKeyScopes_ScopeIDArray: IzzyAPIKeyScope_[]; // Link to APIKeyScopes
    
}

//****************************************************************************
// INPUT TYPE for Scopes
//****************************************************************************
@InputType()
export class CreateIzzyScopeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Scopes
//****************************************************************************
@InputType()
export class UpdateIzzyScopeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Scopes
//****************************************************************************
@ObjectType()
export class RunIzzyScopeViewResult {
    @Field(() => [IzzyScope_])
    Results: IzzyScope_[];

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

@Resolver(IzzyScope_)
export class IzzyScopeResolver extends ResolverBase {
    @Query(() => RunIzzyScopeViewResult)
    async RunIzzyScopeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyScopeViewResult)
    async RunIzzyScopeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzyScopeViewResult)
    async RunIzzyScopeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Scopes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzyScope_, { nullable: true })
    async IzzyScope(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzyScope_ | null> {
        this.CheckUserReadPermissions('Scopes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwScopes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Scopes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Scopes', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyAPIKeyScope_])
    async APIKeyScopes_ScopeIDArray(@Root() izzyscope_: IzzyScope_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('API Key Scopes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwAPIKeyScopes] WHERE [ScopeID]='${izzyscope_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'API Key Scopes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('API Key Scopes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzyScope_)
    async CreateIzzyScope(
        @Arg('input', () => CreateIzzyScopeInput) input: CreateIzzyScopeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Scopes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzyScope_)
    async UpdateIzzyScope(
        @Arg('input', () => UpdateIzzyScopeInput) input: UpdateIzzyScopeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Scopes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzyScope_)
    async DeleteIzzyScope(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Scopes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Setting Categories
//****************************************************************************
@ObjectType({ description: `Hierarchical categories for organizing settings` })
export class IzzySettingCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Category display name`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Description of settings in this category`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true, description: `FontAwesome icon class for UI display`}) 
    @MaxLength(200)
    Icon?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentID?: string;
        
    @Field(() => Int, {description: `Display order within parent category`}) 
    Sequence: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Optional default AllowedScopes for settings in this category. If NULL, each setting uses its own AllowedScopes. Comma-separated values: Organization, Channel.`}) 
    @MaxLength(200)
    AllowedScopes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentID?: string;
        
    @Field(() => [IzzySetting_])
    Settings_CategoryIDArray: IzzySetting_[]; // Link to Settings
    
    @Field(() => [IzzySettingCategory_])
    SettingCategories_ParentIDArray: IzzySettingCategory_[]; // Link to SettingCategories
    
}

//****************************************************************************
// INPUT TYPE for Setting Categories
//****************************************************************************
@InputType()
export class CreateIzzySettingCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Icon: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    AllowedScopes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Setting Categories
//****************************************************************************
@InputType()
export class UpdateIzzySettingCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Icon?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    AllowedScopes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Setting Categories
//****************************************************************************
@ObjectType()
export class RunIzzySettingCategoryViewResult {
    @Field(() => [IzzySettingCategory_])
    Results: IzzySettingCategory_[];

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

@Resolver(IzzySettingCategory_)
export class IzzySettingCategoryResolver extends ResolverBase {
    @Query(() => RunIzzySettingCategoryViewResult)
    async RunIzzySettingCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzySettingCategoryViewResult)
    async RunIzzySettingCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzySettingCategoryViewResult)
    async RunIzzySettingCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Setting Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzySettingCategory_, { nullable: true })
    async IzzySettingCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzySettingCategory_ | null> {
        this.CheckUserReadPermissions('Setting Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwSettingCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Setting Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Setting Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzySetting_])
    async Settings_CategoryIDArray(@Root() izzysettingcategory_: IzzySettingCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Settings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwSettings] WHERE [CategoryID]='${izzysettingcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Settings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Settings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [IzzySettingCategory_])
    async SettingCategories_ParentIDArray(@Root() izzysettingcategory_: IzzySettingCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Setting Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwSettingCategories] WHERE [ParentID]='${izzysettingcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Setting Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Setting Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzySettingCategory_)
    async CreateIzzySettingCategory(
        @Arg('input', () => CreateIzzySettingCategoryInput) input: CreateIzzySettingCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Setting Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzySettingCategory_)
    async UpdateIzzySettingCategory(
        @Arg('input', () => UpdateIzzySettingCategoryInput) input: UpdateIzzySettingCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Setting Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzySettingCategory_)
    async DeleteIzzySettingCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Setting Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Settings
//****************************************************************************
@ObjectType({ description: `Configurable settings that can be customized per organization` })
export class IzzySetting_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Unique programmatic key for the setting`}) 
    @MaxLength(510)
    Key: string;
        
    @Field({description: `Display name for the setting`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Description of what this setting controls`}) 
    Description?: string;
        
    @Field({nullable: true, description: `FontAwesome icon class for UI display`}) 
    @MaxLength(200)
    Icon?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CategoryID?: string;
        
    @Field({description: `Value type: String, Number, Boolean, JSON, Date, Markdown, HTML`}) 
    @MaxLength(100)
    ValueType: string;
        
    @Field({nullable: true, description: `Default value if not overridden`}) 
    DefaultValue?: string;
        
    @Field({nullable: true, description: `Regex pattern for validating values`}) 
    @MaxLength(1000)
    ValidationRegex?: string;
        
    @Field(() => Boolean, {description: `Whether this setting must have a value`}) 
    IsRequired: boolean;
        
    @Field(() => Int, {description: `Display order within category`}) 
    Sequence: number;
        
    @Field({description: `Setting status: Active, Inactive`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => Boolean, {description: `When true, this setting acts as the master on/off switch for its entire category. Other settings in the category are disabled in the UI when this setting value is false.`}) 
    IsCategoryController: boolean;
        
    @Field({description: `Comma-separated list of scopes where this setting can be configured. Values: Organization, Channel. Default allows both with inheritance (Channel overrides Organization).`}) 
    @MaxLength(200)
    AllowedScopes: string;
        
    @Field(() => Int, {nullable: true, description: `Minimum plan level required to configure this setting. If NULL, setting is available to all plans. Maps to Plan.Level values (e.g., Free=0, Starter=10, Pro=20, Enterprise=30).`}) 
    MinimumPlanLevel?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => [IzzyOrganizationSetting_])
    OrganizationSettings_SettingIDArray: IzzyOrganizationSetting_[]; // Link to OrganizationSettings
    
}

//****************************************************************************
// INPUT TYPE for Settings
//****************************************************************************
@InputType()
export class CreateIzzySettingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Key?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Icon: string | null;

    @Field({ nullable: true })
    CategoryID: string | null;

    @Field({ nullable: true })
    ValueType?: string;

    @Field({ nullable: true })
    DefaultValue: string | null;

    @Field({ nullable: true })
    ValidationRegex: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRequired?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsCategoryController?: boolean;

    @Field({ nullable: true })
    AllowedScopes?: string;

    @Field(() => Int, { nullable: true })
    MinimumPlanLevel: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Settings
//****************************************************************************
@InputType()
export class UpdateIzzySettingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Key?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Icon?: string | null;

    @Field({ nullable: true })
    CategoryID?: string | null;

    @Field({ nullable: true })
    ValueType?: string;

    @Field({ nullable: true })
    DefaultValue?: string | null;

    @Field({ nullable: true })
    ValidationRegex?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRequired?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsCategoryController?: boolean;

    @Field({ nullable: true })
    AllowedScopes?: string;

    @Field(() => Int, { nullable: true })
    MinimumPlanLevel?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Settings
//****************************************************************************
@ObjectType()
export class RunIzzySettingViewResult {
    @Field(() => [IzzySetting_])
    Results: IzzySetting_[];

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

@Resolver(IzzySetting_)
export class IzzySettingResolver extends ResolverBase {
    @Query(() => RunIzzySettingViewResult)
    async RunIzzySettingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzySettingViewResult)
    async RunIzzySettingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunIzzySettingViewResult)
    async RunIzzySettingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Settings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => IzzySetting_, { nullable: true })
    async IzzySetting(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IzzySetting_ | null> {
        this.CheckUserReadPermissions('Settings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwSettings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Settings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Settings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [IzzyOrganizationSetting_])
    async OrganizationSettings_SettingIDArray(@Root() izzysetting_: IzzySetting_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Settings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Izzy].[vwOrganizationSettings] WHERE [SettingID]='${izzysetting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Settings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organization Settings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => IzzySetting_)
    async CreateIzzySetting(
        @Arg('input', () => CreateIzzySettingInput) input: CreateIzzySettingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Settings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => IzzySetting_)
    async UpdateIzzySetting(
        @Arg('input', () => UpdateIzzySettingInput) input: UpdateIzzySettingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Settings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => IzzySetting_)
    async DeleteIzzySetting(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Settings', key, options, provider, userPayload, pubSub);
    }
    
}