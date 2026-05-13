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
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { bettyContentItemEntity, bettyInstanceEntity, bettyOrganizationEntity, bettyPromptComponentEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Content Items
//****************************************************************************
@ObjectType({ description: `Betty-specific extension of MJ: Content Items. Shares its primary key with the parent __mj.ContentItem row (TPT inheritance) — a betty.ContentItem.ID is always the same UUID as its corresponding __mj.ContentItem.ID. Adds the tenant scope (OrganizationID), retrieval-context fields (Decorator, SourceIdentifier, UserLink), and chunk hierarchy (ParentID) used by the BLA / BettyNext agents.` })
export class bettyContentItem_ {
    @Field({description: `Shared primary key with the parent __mj.ContentItem row. Same UUID, enforced by FK_BettyContentItem_Inherits. Generate the UUID once when creating the __mj.ContentItem row, then propagate it here.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `FK to betty.Organization. Required — every Betty content item belongs to exactly one organization, and the BLA search path filters by this column at runtime via the Search Scope's Nunjucks-rendered MetadataFilter.`}) 
    @MaxLength(36)
    OrganizationID: string;
        
    @Field({nullable: true, description: `Optional free-text context that helps the LLM (and human reviewers) understand what this content item is and when it's relevant. Indexed into Azure AI Search alongside Name/Description/Text so retrieval can hit author-supplied hints in addition to the raw body text.`}) 
    @MaxLength(2000)
    Decorator?: string;
        
    @Field({description: `Stable identifier of the original source (URL, file path, or other globally-unique string). Used by ingest code to detect and skip duplicates when re-ingesting from the same source. Required.`}) 
    @MaxLength(2000)
    SourceIdentifier: string;
        
    @Field({nullable: true, description: `Optional URL the end user follows to view the source in its original context (e.g. a public web page, an authenticated CMS deep-link, or a doc viewer). Separate from SourceIdentifier — SourceIdentifier is for dedup; UserLink is for human navigation.`}) 
    @MaxLength(2000)
    UserLink?: string;
        
    @Field({nullable: true, description: `Optional self-reference. When the source content is large enough to be split into chunks for embedding/indexing, each chunk's ParentID points at the top-level betty.ContentItem.ID (which is identical to the top-level __mj.ContentItem.ID, by TPT). NULL on the top-level item itself.`}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Organization: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field() 
    @MaxLength(36)
    ContentSourceID: string;
        
    @Field({nullable: true}) 
    @MaxLength(250)
    Name?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(36)
    ContentTypeID: string;
        
    @Field() 
    @MaxLength(36)
    ContentSourceTypeID: string;
        
    @Field() 
    @MaxLength(36)
    ContentFileTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Checksum?: string;
        
    @Field() 
    @MaxLength(2000)
    URL: string;
        
    @Field({nullable: true}) 
    Text?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    EntityRecordDocumentID?: string;
        
    @Field() 
    @MaxLength(20)
    EmbeddingStatus: string;
        
    @Field({nullable: true}) 
    LastEmbeddedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    EmbeddingModelID?: string;
        
    @Field() 
    @MaxLength(20)
    TaggingStatus: string;
        
    @Field({nullable: true}) 
    LastTaggedAt?: Date;
        
    @Field(() => [bettyContentItem_])
    bettyContentItems_ParentIDArray: bettyContentItem_[]; // Link to bettyContentItems
    
}

//****************************************************************************
// INPUT TYPE for Content Items
//****************************************************************************
@InputType()
export class CreatebettyContentItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Decorator: string | null;

    @Field({ nullable: true })
    SourceIdentifier?: string;

    @Field({ nullable: true })
    UserLink: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    ContentSourceID?: string;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ContentTypeID?: string;

    @Field({ nullable: true })
    ContentSourceTypeID?: string;

    @Field({ nullable: true })
    ContentFileTypeID?: string;

    @Field({ nullable: true })
    Checksum: string | null;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Text: string | null;

    @Field({ nullable: true })
    EntityRecordDocumentID: string | null;

    @Field({ nullable: true })
    EmbeddingStatus?: string;

    @Field({ nullable: true })
    LastEmbeddedAt: Date | null;

    @Field({ nullable: true })
    EmbeddingModelID: string | null;

    @Field({ nullable: true })
    TaggingStatus?: string;

    @Field({ nullable: true })
    LastTaggedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Content Items
//****************************************************************************
@InputType()
export class UpdatebettyContentItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Decorator?: string | null;

    @Field({ nullable: true })
    SourceIdentifier?: string;

    @Field({ nullable: true })
    UserLink?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    ContentSourceID?: string;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ContentTypeID?: string;

    @Field({ nullable: true })
    ContentSourceTypeID?: string;

    @Field({ nullable: true })
    ContentFileTypeID?: string;

    @Field({ nullable: true })
    Checksum?: string | null;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Text?: string | null;

    @Field({ nullable: true })
    EntityRecordDocumentID?: string | null;

    @Field({ nullable: true })
    EmbeddingStatus?: string;

    @Field({ nullable: true })
    LastEmbeddedAt?: Date | null;

    @Field({ nullable: true })
    EmbeddingModelID?: string | null;

    @Field({ nullable: true })
    TaggingStatus?: string;

    @Field({ nullable: true })
    LastTaggedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Content Items
//****************************************************************************
@ObjectType()
export class RunbettyContentItemViewResult {
    @Field(() => [bettyContentItem_])
    Results: bettyContentItem_[];

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

@Resolver(bettyContentItem_)
export class bettyContentItemResolver extends ResolverBase {
    @Query(() => RunbettyContentItemViewResult)
    async RunbettyContentItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyContentItemViewResult)
    async RunbettyContentItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyContentItemViewResult)
    async RunbettyContentItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Content Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => bettyContentItem_, { nullable: true })
    async bettyContentItem(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<bettyContentItem_ | null> {
        this.CheckUserReadPermissions('Content Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwContentItems')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Content Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Content Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [bettyContentItem_])
    async bettyContentItems_ParentIDArray(@Root() bettycontentitem_: bettyContentItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Content Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwContentItems')} WHERE ${provider.QuoteIdentifier('ParentID')}='${bettycontentitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Content Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Content Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => bettyContentItem_)
    async CreatebettyContentItem(
        @Arg('input', () => CreatebettyContentItemInput) input: CreatebettyContentItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Content Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => bettyContentItem_)
    async UpdatebettyContentItem(
        @Arg('input', () => UpdatebettyContentItemInput) input: UpdatebettyContentItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Content Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => bettyContentItem_)
    async DeletebettyContentItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Content Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Instances
//****************************************************************************
@ObjectType({ description: `A deployment or environment within an Organization (e.g. dev, prod, customer-specific). InstanceID is always under exactly one OrganizationID; the BLA agent assumes this when narrowing PromptComponent matches.` })
export class bettyInstance_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `FK to the parent Organization. Required.`}) 
    @MaxLength(36)
    OrganizationID: string;
        
    @Field({description: `Instance name. Unique within an Organization.`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Optional free-text description of the instance.`}) 
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Organization: string;
        
    @Field(() => [bettyPromptComponent_])
    bettyPromptComponents_InstanceIDArray: bettyPromptComponent_[]; // Link to bettyPromptComponents
    
}

//****************************************************************************
// INPUT TYPE for Instances
//****************************************************************************
@InputType()
export class CreatebettyInstanceInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Instances
//****************************************************************************
@InputType()
export class UpdatebettyInstanceInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrganizationID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Instances
//****************************************************************************
@ObjectType()
export class RunbettyInstanceViewResult {
    @Field(() => [bettyInstance_])
    Results: bettyInstance_[];

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

@Resolver(bettyInstance_)
export class bettyInstanceResolver extends ResolverBase {
    @Query(() => RunbettyInstanceViewResult)
    async RunbettyInstanceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyInstanceViewResult)
    async RunbettyInstanceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyInstanceViewResult)
    async RunbettyInstanceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Instances';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => bettyInstance_, { nullable: true })
    async bettyInstance(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<bettyInstance_ | null> {
        this.CheckUserReadPermissions('Instances', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwInstances')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Instances', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Instances', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [bettyPromptComponent_])
    async bettyPromptComponents_InstanceIDArray(@Root() bettyinstance_: bettyInstance_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Prompt Components', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwPromptComponents')} WHERE ${provider.QuoteIdentifier('InstanceID')}='${bettyinstance_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Prompt Components', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Prompt Components', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => bettyInstance_)
    async CreatebettyInstance(
        @Arg('input', () => CreatebettyInstanceInput) input: CreatebettyInstanceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Instances', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => bettyInstance_)
    async UpdatebettyInstance(
        @Arg('input', () => UpdatebettyInstanceInput) input: UpdatebettyInstanceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Instances', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => bettyInstance_)
    async DeletebettyInstance(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Instances', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organizations
//****************************************************************************
@ObjectType({ description: `Tenant root for the BLA agent. PromptComponents may be scoped to a specific Organization; rows with no OrganizationID match any organization (least-specific tier).` })
export class bettyOrganization_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable name of the organization. Unique.`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Optional free-text description of the organization.`}) 
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [bettyInstance_])
    bettyInstances_OrganizationIDArray: bettyInstance_[]; // Link to bettyInstances
    
    @Field(() => [bettyContentItem_])
    bettyContentItems_OrganizationIDArray: bettyContentItem_[]; // Link to bettyContentItems
    
    @Field(() => [bettyPromptComponent_])
    bettyPromptComponents_OrganizationIDArray: bettyPromptComponent_[]; // Link to bettyPromptComponents
    
}

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class CreatebettyOrganizationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class UpdatebettyOrganizationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Organizations
//****************************************************************************
@ObjectType()
export class RunbettyOrganizationViewResult {
    @Field(() => [bettyOrganization_])
    Results: bettyOrganization_[];

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

@Resolver(bettyOrganization_)
export class bettyOrganizationResolver extends ResolverBase {
    @Query(() => RunbettyOrganizationViewResult)
    async RunbettyOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyOrganizationViewResult)
    async RunbettyOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyOrganizationViewResult)
    async RunbettyOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => bettyOrganization_, { nullable: true })
    async bettyOrganization(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<bettyOrganization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organizations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [bettyInstance_])
    async bettyInstances_OrganizationIDArray(@Root() bettyorganization_: bettyOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Instances', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwInstances')} WHERE ${provider.QuoteIdentifier('OrganizationID')}='${bettyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Instances', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Instances', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [bettyContentItem_])
    async bettyContentItems_OrganizationIDArray(@Root() bettyorganization_: bettyOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Content Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwContentItems')} WHERE ${provider.QuoteIdentifier('OrganizationID')}='${bettyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Content Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Content Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [bettyPromptComponent_])
    async bettyPromptComponents_OrganizationIDArray(@Root() bettyorganization_: bettyOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Prompt Components', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwPromptComponents')} WHERE ${provider.QuoteIdentifier('OrganizationID')}='${bettyorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Prompt Components', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Prompt Components', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => bettyOrganization_)
    async CreatebettyOrganization(
        @Arg('input', () => CreatebettyOrganizationInput) input: CreatebettyOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => bettyOrganization_)
    async UpdatebettyOrganization(
        @Arg('input', () => UpdatebettyOrganizationInput) input: UpdatebettyOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => bettyOrganization_)
    async DeletebettyOrganization(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Prompt Components
//****************************************************************************
@ObjectType({ description: `A single reusable text snippet for an AIPrompt, optionally scoped to an Organization and/or Instance. The BLA assemble-prompt action selects the most specific component per Name within the matching PromptID (Org+Instance > Org > none) and renders them by Sort + Role into a structured ChatMessage[] for AIPromptRunner.ExecutePrompt.` })
export class bettyPromptComponent_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `FK to the __mj.AIPrompt the component belongs to. Only components matching this PromptID are ever considered, regardless of any other scoping match.`}) 
    @MaxLength(36)
    PromptID: string;
        
    @Field({description: `Logical name of the component within the prompt (e.g. "persona", "task-rules", "few-shot-example"). The BLA selects at most one row per (PromptID, Name) at runtime, using the cascading specificity match.`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Optional free-text description of the component's intent. Not used at runtime.`}) 
    Description?: string;
        
    @Field({description: `The actual text content rendered into a ChatMessage. May include template variables that downstream rendering substitutes.`}) 
    Text: string;
        
    @Field(() => Int, {description: `Final-assembly ordering. Lower Sort renders earlier in the ChatMessage[] (after conversation history). NOT used for selection tie-breaking among same-tier matches — that uses a stable TOP 1 by ID.`}) 
    Sort: number;
        
    @Field({description: `Role of the rendered message in the final ChatMessage[]: System, User, or Assistant. Each component becomes its own message at the LLM API layer, so System -> User -> System -> User sequences are preserved.`}) 
    @MaxLength(20)
    Role: string;
        
    @Field({nullable: true, description: `Optional FK to betty.Organization. NULL means "applies to any organization" (least-specific tier). When non-NULL, the component only matches at runtime if the caller-supplied OrganizationID equals this value.`}) 
    @MaxLength(36)
    OrganizationID?: string;
        
    @Field({nullable: true, description: `Optional FK to betty.Instance. NULL means "applies to any instance within whatever Organization scope is set" (or any instance globally if OrganizationID is also NULL). When non-NULL, the component only matches at runtime if the caller-supplied InstanceID equals this value AND its Organization matches too.`}) 
    @MaxLength(36)
    InstanceID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Prompt: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Instance?: string;
        
}

//****************************************************************************
// INPUT TYPE for Prompt Components
//****************************************************************************
@InputType()
export class CreatebettyPromptComponentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PromptID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Text?: string;

    @Field(() => Int, { nullable: true })
    Sort?: number;

    @Field({ nullable: true })
    Role?: string;

    @Field({ nullable: true })
    OrganizationID: string | null;

    @Field({ nullable: true })
    InstanceID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Prompt Components
//****************************************************************************
@InputType()
export class UpdatebettyPromptComponentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PromptID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Text?: string;

    @Field(() => Int, { nullable: true })
    Sort?: number;

    @Field({ nullable: true })
    Role?: string;

    @Field({ nullable: true })
    OrganizationID?: string | null;

    @Field({ nullable: true })
    InstanceID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Prompt Components
//****************************************************************************
@ObjectType()
export class RunbettyPromptComponentViewResult {
    @Field(() => [bettyPromptComponent_])
    Results: bettyPromptComponent_[];

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

@Resolver(bettyPromptComponent_)
export class bettyPromptComponentResolver extends ResolverBase {
    @Query(() => RunbettyPromptComponentViewResult)
    async RunbettyPromptComponentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyPromptComponentViewResult)
    async RunbettyPromptComponentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunbettyPromptComponentViewResult)
    async RunbettyPromptComponentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Prompt Components';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => bettyPromptComponent_, { nullable: true })
    async bettyPromptComponent(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<bettyPromptComponent_ | null> {
        this.CheckUserReadPermissions('Prompt Components', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('betty', 'vwPromptComponents')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Prompt Components', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Prompt Components', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => bettyPromptComponent_)
    async CreatebettyPromptComponent(
        @Arg('input', () => CreatebettyPromptComponentInput) input: CreatebettyPromptComponentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Prompt Components', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => bettyPromptComponent_)
    async UpdatebettyPromptComponent(
        @Arg('input', () => UpdatebettyPromptComponentInput) input: UpdatebettyPromptComponentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Prompt Components', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => bettyPromptComponent_)
    async DeletebettyPromptComponent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Prompt Components', key, options, provider, userPayload, pubSub);
    }
    
}