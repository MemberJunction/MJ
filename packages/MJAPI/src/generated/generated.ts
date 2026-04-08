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
            GetReadOnlyProvider, GetReadWriteProvider } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { mjCommitteesActionItemEntity, mjBizAppsCommonAddressLinkEntity, mjBizAppsCommonAddressTypeEntity, mjBizAppsCommonAddressEntity, mjCommitteesAgendaItemEntity, mjCommitteesArtifactTypeEntity, mjCommitteesArtifactEntity, mjCommitteesAttendanceEntity, mjCommitteesCommentEntity, mjCommitteesCommitteeEntity, mjBizAppsCommonContactMethodEntity, mjBizAppsCommonContactTypeEntity, mjCommitteesMeetingEntity, mjCommitteesMembershipEntity, mjCommitteesMinuteEntity, mjCommitteesMotionEntity, mjBizAppsCommonOrganizationTypeEntity, mjBizAppsCommonOrganizationEntity, mjBizAppsCommonPersonEntity, mjBizAppsCommonRelationshipTypeEntity, mjBizAppsCommonRelationshipEntity, mjCommitteesRoleEntity, mjCommitteesTermEntity, mjCommitteesTypeEntity, mjCommitteesVideoProviderEntity, mjCommitteesVoteEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Action Items
//****************************************************************************
@ObjectType({ description: `Tasks and action items assigned from committees or meetings` })
export class mjCommitteesActionItem_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CommitteeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MeetingID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AgendaItemID?: string;
        
    @Field({description: `Title of the action item`}) 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true, description: `Detailed description of what needs to be done`}) 
    Description?: string;
        
    @Field() 
    @MaxLength(36)
    AssignedToPersonID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AssignedByPersonID?: string;
        
    @Field({nullable: true, description: `Due date for completion`}) 
    DueDate?: Date;
        
    @Field({description: `Priority level: Low, Medium, High, Critical`}) 
    @MaxLength(20)
    Priority: string;
        
    @Field({description: `Current status: Open, InProgress, Blocked, Completed, Cancelled`}) 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true, description: `Timestamp when the action item was completed`}) 
    CompletedAt?: Date;
        
    @Field({nullable: true, description: `Notes about how the item was completed`}) 
    CompletionNotes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Committee: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Meeting?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AgendaItem?: string;
        
    @Field() 
    @MaxLength(100)
    AssignedToPerson: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    AssignedByPerson?: string;
        
    @Field(() => [mjCommitteesArtifact_])
    mjCommitteesArtifacts_ActionItemIDArray: mjCommitteesArtifact_[]; // Link to mjCommitteesArtifacts
    
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_ActionItemIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
}

//****************************************************************************
// INPUT TYPE for Action Items
//****************************************************************************
@InputType()
export class CreatemjCommitteesActionItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    MeetingID: string | null;

    @Field({ nullable: true })
    AgendaItemID: string | null;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    AssignedToPersonID?: string;

    @Field({ nullable: true })
    AssignedByPersonID: string | null;

    @Field({ nullable: true })
    DueDate: Date | null;

    @Field({ nullable: true })
    Priority?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CompletedAt: Date | null;

    @Field({ nullable: true })
    CompletionNotes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Action Items
//****************************************************************************
@InputType()
export class UpdatemjCommitteesActionItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    MeetingID?: string | null;

    @Field({ nullable: true })
    AgendaItemID?: string | null;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    AssignedToPersonID?: string;

    @Field({ nullable: true })
    AssignedByPersonID?: string | null;

    @Field({ nullable: true })
    DueDate?: Date | null;

    @Field({ nullable: true })
    Priority?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CompletedAt?: Date | null;

    @Field({ nullable: true })
    CompletionNotes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Items
//****************************************************************************
@ObjectType()
export class RunmjCommitteesActionItemViewResult {
    @Field(() => [mjCommitteesActionItem_])
    Results: mjCommitteesActionItem_[];

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

@Resolver(mjCommitteesActionItem_)
export class mjCommitteesActionItemResolver extends ResolverBase {
    @Query(() => RunmjCommitteesActionItemViewResult)
    async RunmjCommitteesActionItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesActionItemViewResult)
    async RunmjCommitteesActionItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesActionItemViewResult)
    async RunmjCommitteesActionItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Action Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesActionItem_, { nullable: true })
    async mjCommitteesActionItem(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesActionItem_ | null> {
        this.CheckUserReadPermissions('Action Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwActionItems')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Action Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Action Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesArtifact_])
    async mjCommitteesArtifacts_ActionItemIDArray(@Root() mjcommitteesactionitem_: mjCommitteesActionItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('ActionItemID')}='${mjcommitteesactionitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Artifacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_ActionItemIDArray(@Root() mjcommitteesactionitem_: mjCommitteesActionItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('ActionItemID')}='${mjcommitteesactionitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesActionItem_)
    async CreatemjCommitteesActionItem(
        @Arg('input', () => CreatemjCommitteesActionItemInput) input: CreatemjCommitteesActionItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Action Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesActionItem_)
    async UpdatemjCommitteesActionItem(
        @Arg('input', () => UpdatemjCommitteesActionItemInput) input: UpdatemjCommitteesActionItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Action Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesActionItem_)
    async DeletemjCommitteesActionItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Address Links
//****************************************************************************
@ObjectType({ description: `Polymorphic link table connecting Address records to any entity record in the system via EntityID and RecordID` })
export class mjBizAppsCommonAddressLink_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    AddressID: string;
        
    @Field() 
    @MaxLength(36)
    EntityID: string;
        
    @Field({description: `Primary key value(s) of the linked record. NVARCHAR(700) to support concatenated composite keys for entities without single-valued primary keys`}) 
    @MaxLength(700)
    RecordID: string;
        
    @Field() 
    @MaxLength(36)
    AddressTypeID: string;
        
    @Field(() => Boolean, {description: `Whether this is the primary address for the linked record. Only one address per entity record should be marked primary`}) 
    IsPrimary: boolean;
        
    @Field(() => Int, {nullable: true, description: `Sort order override for this specific link. When NULL, falls back to AddressType.DefaultRank. Lower values appear first`}) 
    Rank?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Address: string;
        
    @Field() 
    @MaxLength(255)
    Entity: string;
        
    @Field() 
    @MaxLength(100)
    AddressType: string;
        
}

//****************************************************************************
// INPUT TYPE for Address Links
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonAddressLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    AddressID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    AddressTypeID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => Int, { nullable: true })
    Rank: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Address Links
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonAddressLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    AddressID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    AddressTypeID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => Int, { nullable: true })
    Rank?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Address Links
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonAddressLinkViewResult {
    @Field(() => [mjBizAppsCommonAddressLink_])
    Results: mjBizAppsCommonAddressLink_[];

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

@Resolver(mjBizAppsCommonAddressLink_)
export class mjBizAppsCommonAddressLinkResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonAddressLinkViewResult)
    async RunmjBizAppsCommonAddressLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressLinkViewResult)
    async RunmjBizAppsCommonAddressLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressLinkViewResult)
    async RunmjBizAppsCommonAddressLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Address Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonAddressLink_, { nullable: true })
    async mjBizAppsCommonAddressLink(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonAddressLink_ | null> {
        this.CheckUserReadPermissions('Address Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressLinks')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Address Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Address Links', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsCommonAddressLink_)
    async CreatemjBizAppsCommonAddressLink(
        @Arg('input', () => CreatemjBizAppsCommonAddressLinkInput) input: CreatemjBizAppsCommonAddressLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Address Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonAddressLink_)
    async UpdatemjBizAppsCommonAddressLink(
        @Arg('input', () => UpdatemjBizAppsCommonAddressLinkInput) input: UpdatemjBizAppsCommonAddressLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Address Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonAddressLink_)
    async DeletemjBizAppsCommonAddressLink(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Address Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Address Types
//****************************************************************************
@ObjectType({ description: `Categories of addresses such as Home, Work, Mailing, Billing` })
export class mjBizAppsCommonAddressType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the address type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this address type`}) 
    Description?: string;
        
    @Field(() => Int, {description: `Default sort order for this address type in dropdown lists. Lower values appear first. Can be overridden per-record via AddressLink.Rank`}) 
    DefaultRank: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonAddressLink_])
    mjBizAppsCommonAddressLinks_AddressTypeIDArray: mjBizAppsCommonAddressLink_[]; // Link to mjBizAppsCommonAddressLinks
    
}

//****************************************************************************
// INPUT TYPE for Address Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonAddressTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    DefaultRank?: number;
}
    

//****************************************************************************
// INPUT TYPE for Address Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonAddressTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    DefaultRank?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Address Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonAddressTypeViewResult {
    @Field(() => [mjBizAppsCommonAddressType_])
    Results: mjBizAppsCommonAddressType_[];

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

@Resolver(mjBizAppsCommonAddressType_)
export class mjBizAppsCommonAddressTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonAddressTypeViewResult)
    async RunmjBizAppsCommonAddressTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressTypeViewResult)
    async RunmjBizAppsCommonAddressTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressTypeViewResult)
    async RunmjBizAppsCommonAddressTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Address Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonAddressType_, { nullable: true })
    async mjBizAppsCommonAddressType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonAddressType_ | null> {
        this.CheckUserReadPermissions('Address Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Address Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Address Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonAddressLink_])
    async mjBizAppsCommonAddressLinks_AddressTypeIDArray(@Root() mjbizappscommonaddresstype_: mjBizAppsCommonAddressType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Address Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressLinks')} WHERE ${provider.QuoteIdentifier('AddressTypeID')}='${mjbizappscommonaddresstype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Address Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Address Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonAddressType_)
    async CreatemjBizAppsCommonAddressType(
        @Arg('input', () => CreatemjBizAppsCommonAddressTypeInput) input: CreatemjBizAppsCommonAddressTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Address Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonAddressType_)
    async UpdatemjBizAppsCommonAddressType(
        @Arg('input', () => UpdatemjBizAppsCommonAddressTypeInput) input: UpdatemjBizAppsCommonAddressTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Address Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonAddressType_)
    async DeletemjBizAppsCommonAddressType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Address Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Addresses
//****************************************************************************
@ObjectType({ description: `Standalone physical address records linked to entities via AddressLink for sharing across people and organizations` })
export class mjBizAppsCommonAddress_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Street address line 1`}) 
    @MaxLength(255)
    Line1: string;
        
    @Field({nullable: true, description: `Street address line 2 (suite, apt, etc.)`}) 
    @MaxLength(255)
    Line2?: string;
        
    @Field({nullable: true, description: `Street address line 3 (additional detail)`}) 
    @MaxLength(255)
    Line3?: string;
        
    @Field({description: `City or locality name`}) 
    @MaxLength(100)
    City: string;
        
    @Field({nullable: true, description: `State, province, or region`}) 
    @MaxLength(100)
    StateProvince?: string;
        
    @Field({nullable: true, description: `Postal or ZIP code`}) 
    @MaxLength(20)
    PostalCode?: string;
        
    @Field({description: `Country code or name, defaults to US`}) 
    @MaxLength(100)
    Country: string;
        
    @Field(() => Float, {nullable: true, description: `Geographic latitude for mapping`}) 
    Latitude?: number;
        
    @Field(() => Float, {nullable: true, description: `Geographic longitude for mapping`}) 
    Longitude?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonAddressLink_])
    mjBizAppsCommonAddressLinks_AddressIDArray: mjBizAppsCommonAddressLink_[]; // Link to mjBizAppsCommonAddressLinks
    
}

//****************************************************************************
// INPUT TYPE for Addresses
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonAddressInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Line1?: string;

    @Field({ nullable: true })
    Line2: string | null;

    @Field({ nullable: true })
    Line3: string | null;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    StateProvince: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    Country?: string;

    @Field(() => Float, { nullable: true })
    Latitude: number | null;

    @Field(() => Float, { nullable: true })
    Longitude: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Addresses
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonAddressInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Line1?: string;

    @Field({ nullable: true })
    Line2?: string | null;

    @Field({ nullable: true })
    Line3?: string | null;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    StateProvince?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    Country?: string;

    @Field(() => Float, { nullable: true })
    Latitude?: number | null;

    @Field(() => Float, { nullable: true })
    Longitude?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Addresses
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonAddressViewResult {
    @Field(() => [mjBizAppsCommonAddress_])
    Results: mjBizAppsCommonAddress_[];

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

@Resolver(mjBizAppsCommonAddress_)
export class mjBizAppsCommonAddressResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonAddressViewResult)
    async RunmjBizAppsCommonAddressViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressViewResult)
    async RunmjBizAppsCommonAddressViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressViewResult)
    async RunmjBizAppsCommonAddressDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Addresses';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonAddress_, { nullable: true })
    async mjBizAppsCommonAddress(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonAddress_ | null> {
        this.CheckUserReadPermissions('Addresses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddresses')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Addresses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Addresses', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonAddressLink_])
    async mjBizAppsCommonAddressLinks_AddressIDArray(@Root() mjbizappscommonaddress_: mjBizAppsCommonAddress_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Address Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressLinks')} WHERE ${provider.QuoteIdentifier('AddressID')}='${mjbizappscommonaddress_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Address Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Address Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonAddress_)
    async CreatemjBizAppsCommonAddress(
        @Arg('input', () => CreatemjBizAppsCommonAddressInput) input: CreatemjBizAppsCommonAddressInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Addresses', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonAddress_)
    async UpdatemjBizAppsCommonAddress(
        @Arg('input', () => UpdatemjBizAppsCommonAddressInput) input: UpdatemjBizAppsCommonAddressInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Addresses', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonAddress_)
    async DeletemjBizAppsCommonAddress(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Addresses', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Agenda Items
//****************************************************************************
@ObjectType({ description: `Structured agenda items for meetings with hierarchy support` })
export class mjCommitteesAgendaItem_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MeetingID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentAgendaItemID?: string;
        
    @Field(() => Int, {description: `Display order within the meeting agenda`}) 
    Sequence: number;
        
    @Field({description: `Title of the agenda item`}) 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true, description: `Detailed description of the agenda item`}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PresenterPersonID?: string;
        
    @Field(() => Int, {nullable: true, description: `Estimated duration in minutes`}) 
    DurationMinutes?: number;
        
    @Field({description: `Type of item: Information, Discussion, Action, Vote, Report, Other`}) 
    @MaxLength(50)
    ItemType: string;
        
    @Field({nullable: true, description: `URL to related document for this item`}) 
    @MaxLength(1000)
    RelatedDocumentURL?: string;
        
    @Field({description: `Current status: Pending, Discussed, Tabled, Completed, Skipped`}) 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true, description: `Discussion notes and outcomes captured during the meeting`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Meeting: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ParentAgendaItem?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    PresenterPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentAgendaItemID?: string;
        
    @Field(() => [mjCommitteesAgendaItem_])
    mjCommitteesAgendaItems_ParentAgendaItemIDArray: mjCommitteesAgendaItem_[]; // Link to mjCommitteesAgendaItems
    
    @Field(() => [mjCommitteesMotion_])
    mjCommitteesMotions_AgendaItemIDArray: mjCommitteesMotion_[]; // Link to mjCommitteesMotions
    
    @Field(() => [mjCommitteesActionItem_])
    mjCommitteesActionItems_AgendaItemIDArray: mjCommitteesActionItem_[]; // Link to mjCommitteesActionItems
    
    @Field(() => [mjCommitteesArtifact_])
    mjCommitteesArtifacts_AgendaItemIDArray: mjCommitteesArtifact_[]; // Link to mjCommitteesArtifacts
    
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_AgendaItemIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
}

//****************************************************************************
// INPUT TYPE for Agenda Items
//****************************************************************************
@InputType()
export class CreatemjCommitteesAgendaItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MeetingID?: string;

    @Field({ nullable: true })
    ParentAgendaItemID: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    PresenterPersonID: string | null;

    @Field(() => Int, { nullable: true })
    DurationMinutes: number | null;

    @Field({ nullable: true })
    ItemType?: string;

    @Field({ nullable: true })
    RelatedDocumentURL: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Agenda Items
//****************************************************************************
@InputType()
export class UpdatemjCommitteesAgendaItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MeetingID?: string;

    @Field({ nullable: true })
    ParentAgendaItemID?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    PresenterPersonID?: string | null;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number | null;

    @Field({ nullable: true })
    ItemType?: string;

    @Field({ nullable: true })
    RelatedDocumentURL?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Agenda Items
//****************************************************************************
@ObjectType()
export class RunmjCommitteesAgendaItemViewResult {
    @Field(() => [mjCommitteesAgendaItem_])
    Results: mjCommitteesAgendaItem_[];

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

@Resolver(mjCommitteesAgendaItem_)
export class mjCommitteesAgendaItemResolver extends ResolverBase {
    @Query(() => RunmjCommitteesAgendaItemViewResult)
    async RunmjCommitteesAgendaItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesAgendaItemViewResult)
    async RunmjCommitteesAgendaItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesAgendaItemViewResult)
    async RunmjCommitteesAgendaItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Agenda Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesAgendaItem_, { nullable: true })
    async mjCommitteesAgendaItem(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesAgendaItem_ | null> {
        this.CheckUserReadPermissions('Agenda Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAgendaItems')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Agenda Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Agenda Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesAgendaItem_])
    async mjCommitteesAgendaItems_ParentAgendaItemIDArray(@Root() mjcommitteesagendaitem_: mjCommitteesAgendaItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Agenda Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAgendaItems')} WHERE ${provider.QuoteIdentifier('ParentAgendaItemID')}='${mjcommitteesagendaitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Agenda Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Agenda Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesMotion_])
    async mjCommitteesMotions_AgendaItemIDArray(@Root() mjcommitteesagendaitem_: mjCommitteesAgendaItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Motions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMotions')} WHERE ${provider.QuoteIdentifier('AgendaItemID')}='${mjcommitteesagendaitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Motions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Motions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesActionItem_])
    async mjCommitteesActionItems_AgendaItemIDArray(@Root() mjcommitteesagendaitem_: mjCommitteesAgendaItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwActionItems')} WHERE ${provider.QuoteIdentifier('AgendaItemID')}='${mjcommitteesagendaitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Action Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Action Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesArtifact_])
    async mjCommitteesArtifacts_AgendaItemIDArray(@Root() mjcommitteesagendaitem_: mjCommitteesAgendaItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('AgendaItemID')}='${mjcommitteesagendaitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Artifacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_AgendaItemIDArray(@Root() mjcommitteesagendaitem_: mjCommitteesAgendaItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('AgendaItemID')}='${mjcommitteesagendaitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesAgendaItem_)
    async CreatemjCommitteesAgendaItem(
        @Arg('input', () => CreatemjCommitteesAgendaItemInput) input: CreatemjCommitteesAgendaItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Agenda Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesAgendaItem_)
    async UpdatemjCommitteesAgendaItem(
        @Arg('input', () => UpdatemjCommitteesAgendaItemInput) input: UpdatemjCommitteesAgendaItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Agenda Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesAgendaItem_)
    async DeletemjCommitteesAgendaItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Agenda Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Artifact Types
//****************************************************************************
@ObjectType({ description: `Categories of committee artifacts with optional extension entity for type-specific fields` })
export class mjCommitteesArtifactType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the artifact type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this artifact type`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Optional reference to an MJ Entity that provides additional fields for this artifact type via a 1:1 extension table`}) 
    @MaxLength(36)
    ExtendedEntityID?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ExtendedEntity?: string;
        
    @Field(() => [mjCommitteesArtifact_])
    mjCommitteesArtifacts_ArtifactTypeIDArray: mjCommitteesArtifact_[]; // Link to mjCommitteesArtifacts
    
}

//****************************************************************************
// INPUT TYPE for Artifact Types
//****************************************************************************
@InputType()
export class CreatemjCommitteesArtifactTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ExtendedEntityID: string | null;

    @Field({ nullable: true })
    IconClass: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Artifact Types
//****************************************************************************
@InputType()
export class UpdatemjCommitteesArtifactTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ExtendedEntityID?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Artifact Types
//****************************************************************************
@ObjectType()
export class RunmjCommitteesArtifactTypeViewResult {
    @Field(() => [mjCommitteesArtifactType_])
    Results: mjCommitteesArtifactType_[];

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

@Resolver(mjCommitteesArtifactType_)
export class mjCommitteesArtifactTypeResolver extends ResolverBase {
    @Query(() => RunmjCommitteesArtifactTypeViewResult)
    async RunmjCommitteesArtifactTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesArtifactTypeViewResult)
    async RunmjCommitteesArtifactTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesArtifactTypeViewResult)
    async RunmjCommitteesArtifactTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Artifact Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesArtifactType_, { nullable: true })
    async mjCommitteesArtifactType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesArtifactType_ | null> {
        this.CheckUserReadPermissions('Artifact Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifactTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifact Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Artifact Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesArtifact_])
    async mjCommitteesArtifacts_ArtifactTypeIDArray(@Root() mjcommitteesartifacttype_: mjCommitteesArtifactType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('ArtifactTypeID')}='${mjcommitteesartifacttype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Artifacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesArtifactType_)
    async CreatemjCommitteesArtifactType(
        @Arg('input', () => CreatemjCommitteesArtifactTypeInput) input: CreatemjCommitteesArtifactTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Artifact Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesArtifactType_)
    async UpdatemjCommitteesArtifactType(
        @Arg('input', () => UpdatemjCommitteesArtifactTypeInput) input: UpdatemjCommitteesArtifactTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Artifact Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesArtifactType_)
    async DeletemjCommitteesArtifactType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Artifact Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Artifacts
//****************************************************************************
@ObjectType({ description: `Links to external documents and files from various providers` })
export class mjCommitteesArtifact_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CommitteeID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MeetingID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AgendaItemID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ActionItemID?: string;
        
    @Field({description: `Display title for the artifact`}) 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true, description: `Description of the artifact contents`}) 
    Description?: string;
        
    @Field() 
    @MaxLength(36)
    ArtifactTypeID: string;
        
    @Field({description: `Storage provider: GoogleDrive, SharePoint, Box, OneDrive, Dropbox, URL`}) 
    @MaxLength(50)
    Provider: string;
        
    @Field({nullable: true, description: `Provider-specific document or file ID`}) 
    @MaxLength(500)
    ExternalID?: string;
        
    @Field({description: `Direct URL to access the artifact`}) 
    @MaxLength(2000)
    URL: string;
        
    @Field({nullable: true, description: `MIME type of the file`}) 
    @MaxLength(100)
    MimeType?: string;
        
    @Field(() => Int, {nullable: true, description: `File size in bytes`}) 
    FileSize?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    UploadedByPersonID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Committee?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Meeting?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AgendaItem?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ActionItem?: string;
        
    @Field() 
    @MaxLength(100)
    ArtifactType: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    UploadedByPerson?: string;
        
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_ArtifactIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
}

//****************************************************************************
// INPUT TYPE for Artifacts
//****************************************************************************
@InputType()
export class CreatemjCommitteesArtifactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CommitteeID: string | null;

    @Field({ nullable: true })
    MeetingID: string | null;

    @Field({ nullable: true })
    AgendaItemID: string | null;

    @Field({ nullable: true })
    ActionItemID: string | null;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ArtifactTypeID?: string;

    @Field({ nullable: true })
    Provider?: string;

    @Field({ nullable: true })
    ExternalID: string | null;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    MimeType: string | null;

    @Field(() => Int, { nullable: true })
    FileSize: number | null;

    @Field({ nullable: true })
    UploadedByPersonID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Artifacts
//****************************************************************************
@InputType()
export class UpdatemjCommitteesArtifactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CommitteeID?: string | null;

    @Field({ nullable: true })
    MeetingID?: string | null;

    @Field({ nullable: true })
    AgendaItemID?: string | null;

    @Field({ nullable: true })
    ActionItemID?: string | null;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ArtifactTypeID?: string;

    @Field({ nullable: true })
    Provider?: string;

    @Field({ nullable: true })
    ExternalID?: string | null;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    MimeType?: string | null;

    @Field(() => Int, { nullable: true })
    FileSize?: number | null;

    @Field({ nullable: true })
    UploadedByPersonID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Artifacts
//****************************************************************************
@ObjectType()
export class RunmjCommitteesArtifactViewResult {
    @Field(() => [mjCommitteesArtifact_])
    Results: mjCommitteesArtifact_[];

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

@Resolver(mjCommitteesArtifact_)
export class mjCommitteesArtifactResolver extends ResolverBase {
    @Query(() => RunmjCommitteesArtifactViewResult)
    async RunmjCommitteesArtifactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesArtifactViewResult)
    async RunmjCommitteesArtifactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesArtifactViewResult)
    async RunmjCommitteesArtifactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Artifacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesArtifact_, { nullable: true })
    async mjCommitteesArtifact(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesArtifact_ | null> {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Artifacts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_ArtifactIDArray(@Root() mjcommitteesartifact_: mjCommitteesArtifact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('ArtifactID')}='${mjcommitteesartifact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesArtifact_)
    async CreatemjCommitteesArtifact(
        @Arg('input', () => CreatemjCommitteesArtifactInput) input: CreatemjCommitteesArtifactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Artifacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesArtifact_)
    async UpdatemjCommitteesArtifact(
        @Arg('input', () => UpdatemjCommitteesArtifactInput) input: UpdatemjCommitteesArtifactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Artifacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesArtifact_)
    async DeletemjCommitteesArtifact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Artifacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Attendances
//****************************************************************************
@ObjectType({ description: `Meeting attendance records for committee members` })
export class mjCommitteesAttendance_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MeetingID: string;
        
    @Field() 
    @MaxLength(36)
    PersonID: string;
        
    @Field({description: `Attendance status: Expected, Present, Absent, Excused, Partial`}) 
    @MaxLength(50)
    AttendanceStatus: string;
        
    @Field({nullable: true, description: `Timestamp when the attendee joined the meeting`}) 
    JoinedAt?: Date;
        
    @Field({nullable: true, description: `Timestamp when the attendee left the meeting`}) 
    LeftAt?: Date;
        
    @Field({nullable: true, description: `Additional notes about attendance`}) 
    @MaxLength(500)
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Meeting: string;
        
    @Field() 
    @MaxLength(100)
    Person: string;
        
}

//****************************************************************************
// INPUT TYPE for Attendances
//****************************************************************************
@InputType()
export class CreatemjCommitteesAttendanceInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MeetingID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    AttendanceStatus?: string;

    @Field({ nullable: true })
    JoinedAt: Date | null;

    @Field({ nullable: true })
    LeftAt: Date | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Attendances
//****************************************************************************
@InputType()
export class UpdatemjCommitteesAttendanceInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MeetingID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    AttendanceStatus?: string;

    @Field({ nullable: true })
    JoinedAt?: Date | null;

    @Field({ nullable: true })
    LeftAt?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Attendances
//****************************************************************************
@ObjectType()
export class RunmjCommitteesAttendanceViewResult {
    @Field(() => [mjCommitteesAttendance_])
    Results: mjCommitteesAttendance_[];

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

@Resolver(mjCommitteesAttendance_)
export class mjCommitteesAttendanceResolver extends ResolverBase {
    @Query(() => RunmjCommitteesAttendanceViewResult)
    async RunmjCommitteesAttendanceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesAttendanceViewResult)
    async RunmjCommitteesAttendanceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesAttendanceViewResult)
    async RunmjCommitteesAttendanceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Attendances';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesAttendance_, { nullable: true })
    async mjCommitteesAttendance(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesAttendance_ | null> {
        this.CheckUserReadPermissions('Attendances', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAttendances')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Attendances', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Attendances', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjCommitteesAttendance_)
    async CreatemjCommitteesAttendance(
        @Arg('input', () => CreatemjCommitteesAttendanceInput) input: CreatemjCommitteesAttendanceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Attendances', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesAttendance_)
    async UpdatemjCommitteesAttendance(
        @Arg('input', () => UpdatemjCommitteesAttendanceInput) input: UpdatemjCommitteesAttendanceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Attendances', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesAttendance_)
    async DeletemjCommitteesAttendance(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Attendances', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Comments
//****************************************************************************
@ObjectType({ description: `Threaded discussion comments on committee meetings, agenda items, action items, and documents` })
export class mjCommitteesComment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CommitteeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MeetingID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AgendaItemID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ActionItemID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ArtifactID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentCommentID?: string;
        
    @Field() 
    @MaxLength(36)
    PersonID: string;
        
    @Field() 
    CommentText: string;
        
    @Field({nullable: true}) 
    MentionedPersonIDs?: string;
        
    @Field(() => Boolean) 
    IsResolved: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Committee: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Meeting?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AgendaItem?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ActionItem?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Artifact?: string;
        
    @Field({nullable: true}) 
    ParentComment?: string;
        
    @Field() 
    @MaxLength(100)
    Person: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentCommentID?: string;
        
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_ParentCommentIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
}

//****************************************************************************
// INPUT TYPE for Comments
//****************************************************************************
@InputType()
export class CreatemjCommitteesCommentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    MeetingID: string | null;

    @Field({ nullable: true })
    AgendaItemID: string | null;

    @Field({ nullable: true })
    ActionItemID: string | null;

    @Field({ nullable: true })
    ArtifactID: string | null;

    @Field({ nullable: true })
    ParentCommentID: string | null;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    CommentText?: string;

    @Field({ nullable: true })
    MentionedPersonIDs: string | null;

    @Field(() => Boolean, { nullable: true })
    IsResolved?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Comments
//****************************************************************************
@InputType()
export class UpdatemjCommitteesCommentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    MeetingID?: string | null;

    @Field({ nullable: true })
    AgendaItemID?: string | null;

    @Field({ nullable: true })
    ActionItemID?: string | null;

    @Field({ nullable: true })
    ArtifactID?: string | null;

    @Field({ nullable: true })
    ParentCommentID?: string | null;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    CommentText?: string;

    @Field({ nullable: true })
    MentionedPersonIDs?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsResolved?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Comments
//****************************************************************************
@ObjectType()
export class RunmjCommitteesCommentViewResult {
    @Field(() => [mjCommitteesComment_])
    Results: mjCommitteesComment_[];

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

@Resolver(mjCommitteesComment_)
export class mjCommitteesCommentResolver extends ResolverBase {
    @Query(() => RunmjCommitteesCommentViewResult)
    async RunmjCommitteesCommentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesCommentViewResult)
    async RunmjCommitteesCommentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesCommentViewResult)
    async RunmjCommitteesCommentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Comments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesComment_, { nullable: true })
    async mjCommitteesComment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesComment_ | null> {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Comments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_ParentCommentIDArray(@Root() mjcommitteescomment_: mjCommitteesComment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('ParentCommentID')}='${mjcommitteescomment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesComment_)
    async CreatemjCommitteesComment(
        @Arg('input', () => CreatemjCommitteesCommentInput) input: CreatemjCommitteesCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Comments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesComment_)
    async UpdatemjCommitteesComment(
        @Arg('input', () => UpdatemjCommitteesCommentInput) input: UpdatemjCommitteesCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Comments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesComment_)
    async DeletemjCommitteesComment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Comments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Committees
//****************************************************************************
@ObjectType({ description: `Core committee records with hierarchy support` })
export class mjCommitteesCommittee_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Official name of the committee`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of the committee purpose and scope`}) 
    Description?: string;
        
    @Field() 
    @MaxLength(36)
    TypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentCommitteeID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrganizationID?: string;
        
    @Field({nullable: true, description: `URL to the committee charter document`}) 
    @MaxLength(1000)
    CharterDocumentURL?: string;
        
    @Field({nullable: true, description: `Brief statement of the committee mission`}) 
    MissionStatement?: string;
        
    @Field({description: `Current status: Active, Inactive, Pending, or Dissolved`}) 
    @MaxLength(50)
    Status: string;
        
    @Field(() => Boolean, {description: `Whether the committee is visible to all users`}) 
    IsPublic: boolean;
        
    @Field({nullable: true, description: `Date the committee was formed`}) 
    FormationDate?: Date;
        
    @Field({nullable: true, description: `Date the committee was dissolved, if applicable`}) 
    DissolutionDate?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Type: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ParentCommittee?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentCommitteeID?: string;
        
    @Field(() => [mjCommitteesTerm_])
    mjCommitteesTerms_CommitteeIDArray: mjCommitteesTerm_[]; // Link to mjCommitteesTerms
    
    @Field(() => [mjCommitteesMeeting_])
    mjCommitteesMeetings_CommitteeIDArray: mjCommitteesMeeting_[]; // Link to mjCommitteesMeetings
    
    @Field(() => [mjCommitteesArtifact_])
    mjCommitteesArtifacts_CommitteeIDArray: mjCommitteesArtifact_[]; // Link to mjCommitteesArtifacts
    
    @Field(() => [mjCommitteesCommittee_])
    mjCommitteesCommittees_ParentCommitteeIDArray: mjCommitteesCommittee_[]; // Link to mjCommitteesCommittees
    
    @Field(() => [mjCommitteesActionItem_])
    mjCommitteesActionItems_CommitteeIDArray: mjCommitteesActionItem_[]; // Link to mjCommitteesActionItems
    
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_CommitteeIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
}

//****************************************************************************
// INPUT TYPE for Committees
//****************************************************************************
@InputType()
export class CreatemjCommitteesCommitteeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TypeID?: string;

    @Field({ nullable: true })
    ParentCommitteeID: string | null;

    @Field({ nullable: true })
    OrganizationID: string | null;

    @Field({ nullable: true })
    CharterDocumentURL: string | null;

    @Field({ nullable: true })
    MissionStatement: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsPublic?: boolean;

    @Field({ nullable: true })
    FormationDate: Date | null;

    @Field({ nullable: true })
    DissolutionDate: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Committees
//****************************************************************************
@InputType()
export class UpdatemjCommitteesCommitteeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TypeID?: string;

    @Field({ nullable: true })
    ParentCommitteeID?: string | null;

    @Field({ nullable: true })
    OrganizationID?: string | null;

    @Field({ nullable: true })
    CharterDocumentURL?: string | null;

    @Field({ nullable: true })
    MissionStatement?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsPublic?: boolean;

    @Field({ nullable: true })
    FormationDate?: Date | null;

    @Field({ nullable: true })
    DissolutionDate?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Committees
//****************************************************************************
@ObjectType()
export class RunmjCommitteesCommitteeViewResult {
    @Field(() => [mjCommitteesCommittee_])
    Results: mjCommitteesCommittee_[];

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

@Resolver(mjCommitteesCommittee_)
export class mjCommitteesCommitteeResolver extends ResolverBase {
    @Query(() => RunmjCommitteesCommitteeViewResult)
    async RunmjCommitteesCommitteeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesCommitteeViewResult)
    async RunmjCommitteesCommitteeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesCommitteeViewResult)
    async RunmjCommitteesCommitteeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Committees';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesCommittee_, { nullable: true })
    async mjCommitteesCommittee(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesCommittee_ | null> {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwCommittees')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Committees', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesTerm_])
    async mjCommitteesTerms_CommitteeIDArray(@Root() mjcommitteescommittee_: mjCommitteesCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Terms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwTerms')} WHERE ${provider.QuoteIdentifier('CommitteeID')}='${mjcommitteescommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Terms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Terms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesMeeting_])
    async mjCommitteesMeetings_CommitteeIDArray(@Root() mjcommitteescommittee_: mjCommitteesCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMeetings')} WHERE ${provider.QuoteIdentifier('CommitteeID')}='${mjcommitteescommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesArtifact_])
    async mjCommitteesArtifacts_CommitteeIDArray(@Root() mjcommitteescommittee_: mjCommitteesCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('CommitteeID')}='${mjcommitteescommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Artifacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesCommittee_])
    async mjCommitteesCommittees_ParentCommitteeIDArray(@Root() mjcommitteescommittee_: mjCommitteesCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwCommittees')} WHERE ${provider.QuoteIdentifier('ParentCommitteeID')}='${mjcommitteescommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesActionItem_])
    async mjCommitteesActionItems_CommitteeIDArray(@Root() mjcommitteescommittee_: mjCommitteesCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwActionItems')} WHERE ${provider.QuoteIdentifier('CommitteeID')}='${mjcommitteescommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Action Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Action Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_CommitteeIDArray(@Root() mjcommitteescommittee_: mjCommitteesCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('CommitteeID')}='${mjcommitteescommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesCommittee_)
    async CreatemjCommitteesCommittee(
        @Arg('input', () => CreatemjCommitteesCommitteeInput) input: CreatemjCommitteesCommitteeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Committees', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesCommittee_)
    async UpdatemjCommitteesCommittee(
        @Arg('input', () => UpdatemjCommitteesCommitteeInput) input: UpdatemjCommitteesCommitteeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Committees', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesCommittee_)
    async DeletemjCommitteesCommittee(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Committees', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Methods
//****************************************************************************
@ObjectType({ description: `Additional contact methods for people and organizations beyond the primary email and phone fields` })
export class mjBizAppsCommonContactMethod_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrganizationID?: string;
        
    @Field() 
    @MaxLength(36)
    ContactTypeID: string;
        
    @Field({description: `The contact value: phone number, email address, URL, social media handle, etc.`}) 
    @MaxLength(500)
    Value: string;
        
    @Field({nullable: true, description: `Descriptive label such as Work cell, Personal Gmail, Corporate LinkedIn`}) 
    @MaxLength(100)
    Label?: string;
        
    @Field(() => Boolean, {description: `Whether this is the primary contact method of its type for the linked person or organization`}) 
    IsPrimary: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Person?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field() 
    @MaxLength(100)
    ContactType: string;
        
}

//****************************************************************************
// INPUT TYPE for Contact Methods
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonContactMethodInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PersonID: string | null;

    @Field({ nullable: true })
    OrganizationID: string | null;

    @Field({ nullable: true })
    ContactTypeID?: string;

    @Field({ nullable: true })
    Value?: string;

    @Field({ nullable: true })
    Label: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Contact Methods
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonContactMethodInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PersonID?: string | null;

    @Field({ nullable: true })
    OrganizationID?: string | null;

    @Field({ nullable: true })
    ContactTypeID?: string;

    @Field({ nullable: true })
    Value?: string;

    @Field({ nullable: true })
    Label?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Methods
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonContactMethodViewResult {
    @Field(() => [mjBizAppsCommonContactMethod_])
    Results: mjBizAppsCommonContactMethod_[];

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

@Resolver(mjBizAppsCommonContactMethod_)
export class mjBizAppsCommonContactMethodResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonContactMethodViewResult)
    async RunmjBizAppsCommonContactMethodViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactMethodViewResult)
    async RunmjBizAppsCommonContactMethodViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactMethodViewResult)
    async RunmjBizAppsCommonContactMethodDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Methods';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonContactMethod_, { nullable: true })
    async mjBizAppsCommonContactMethod(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonContactMethod_ | null> {
        this.CheckUserReadPermissions('Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Methods', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsCommonContactMethod_)
    async CreatemjBizAppsCommonContactMethod(
        @Arg('input', () => CreatemjBizAppsCommonContactMethodInput) input: CreatemjBizAppsCommonContactMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Methods', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonContactMethod_)
    async UpdatemjBizAppsCommonContactMethod(
        @Arg('input', () => UpdatemjBizAppsCommonContactMethodInput) input: UpdatemjBizAppsCommonContactMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Methods', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonContactMethod_)
    async DeletemjBizAppsCommonContactMethod(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Methods', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Types
//****************************************************************************
@ObjectType({ description: `Categories of contact methods such as Phone, Mobile, Email, LinkedIn, Website` })
export class mjBizAppsCommonContactType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the contact type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this contact type`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonContactMethod_])
    mjBizAppsCommonContactMethods_ContactTypeIDArray: mjBizAppsCommonContactMethod_[]; // Link to mjBizAppsCommonContactMethods
    
}

//****************************************************************************
// INPUT TYPE for Contact Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonContactTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    IconClass: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonContactTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonContactTypeViewResult {
    @Field(() => [mjBizAppsCommonContactType_])
    Results: mjBizAppsCommonContactType_[];

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

@Resolver(mjBizAppsCommonContactType_)
export class mjBizAppsCommonContactTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonContactTypeViewResult)
    async RunmjBizAppsCommonContactTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactTypeViewResult)
    async RunmjBizAppsCommonContactTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactTypeViewResult)
    async RunmjBizAppsCommonContactTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonContactType_, { nullable: true })
    async mjBizAppsCommonContactType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonContactType_ | null> {
        this.CheckUserReadPermissions('Contact Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonContactMethod_])
    async mjBizAppsCommonContactMethods_ContactTypeIDArray(@Root() mjbizappscommoncontacttype_: mjBizAppsCommonContactType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('ContactTypeID')}='${mjbizappscommoncontacttype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonContactType_)
    async CreatemjBizAppsCommonContactType(
        @Arg('input', () => CreatemjBizAppsCommonContactTypeInput) input: CreatemjBizAppsCommonContactTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonContactType_)
    async UpdatemjBizAppsCommonContactType(
        @Arg('input', () => UpdatemjBizAppsCommonContactTypeInput) input: UpdatemjBizAppsCommonContactTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonContactType_)
    async DeletemjBizAppsCommonContactType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Meetings
//****************************************************************************
@ObjectType({ description: `Committee meeting records with scheduling and video conferencing info` })
export class mjCommitteesMeeting_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CommitteeID: string;
        
    @Field({description: `Title of the meeting`}) 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true, description: `Detailed description or purpose of the meeting`}) 
    Description?: string;
        
    @Field({description: `Scheduled start date and time with timezone offset`}) 
    StartDateTime: Date;
        
    @Field({nullable: true, description: `Scheduled end date and time with timezone offset`}) 
    EndDateTime?: Date;
        
    @Field({description: `IANA timezone identifier for the meeting`}) 
    @MaxLength(50)
    TimeZone: string;
        
    @Field({description: `Meeting format: Virtual, InPerson, or Hybrid`}) 
    @MaxLength(50)
    LocationType: string;
        
    @Field({nullable: true, description: `Physical address or room name for in-person meetings`}) 
    @MaxLength(500)
    LocationText?: string;
        
    @Field({nullable: true, description: `Video conferencing provider: Zoom, Teams, Meet, etc.`}) 
    @MaxLength(50)
    VideoProvider?: string;
        
    @Field({nullable: true, description: `External meeting ID from the video provider`}) 
    @MaxLength(255)
    VideoMeetingID?: string;
        
    @Field({nullable: true, description: `URL to join the video meeting`}) 
    @MaxLength(1000)
    VideoJoinURL?: string;
        
    @Field({nullable: true, description: `URL to the meeting recording after completion`}) 
    @MaxLength(1000)
    VideoRecordingURL?: string;
        
    @Field({nullable: true, description: `URL to the meeting transcript`}) 
    @MaxLength(1000)
    TranscriptURL?: string;
        
    @Field({description: `Current status: Draft, Scheduled, InProgress, Completed, Cancelled, Postponed`}) 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true, description: `External calendar event ID for sync purposes`}) 
    @MaxLength(255)
    CalendarEventID?: string;
        
    @Field({nullable: true, description: `FK to VideoProvider — when set, video meeting URL is auto-created on save`}) 
    @MaxLength(36)
    VideoProviderID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Committee: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    VideoProvider_Virtual?: string;
        
    @Field(() => [mjCommitteesMinute_])
    mjCommitteesMinutes_ApprovedByMeetingIDArray: mjCommitteesMinute_[]; // Link to mjCommitteesMinutes
    
    @Field(() => [mjCommitteesMinute_])
    mjCommitteesMinutes_MeetingIDArray: mjCommitteesMinute_[]; // Link to mjCommitteesMinutes
    
    @Field(() => [mjCommitteesAgendaItem_])
    mjCommitteesAgendaItems_MeetingIDArray: mjCommitteesAgendaItem_[]; // Link to mjCommitteesAgendaItems
    
    @Field(() => [mjCommitteesAttendance_])
    mjCommitteesAttendances_MeetingIDArray: mjCommitteesAttendance_[]; // Link to mjCommitteesAttendances
    
    @Field(() => [mjCommitteesArtifact_])
    mjCommitteesArtifacts_MeetingIDArray: mjCommitteesArtifact_[]; // Link to mjCommitteesArtifacts
    
    @Field(() => [mjCommitteesMotion_])
    mjCommitteesMotions_MeetingIDArray: mjCommitteesMotion_[]; // Link to mjCommitteesMotions
    
    @Field(() => [mjCommitteesActionItem_])
    mjCommitteesActionItems_MeetingIDArray: mjCommitteesActionItem_[]; // Link to mjCommitteesActionItems
    
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_MeetingIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
}

//****************************************************************************
// INPUT TYPE for Meetings
//****************************************************************************
@InputType()
export class CreatemjCommitteesMeetingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    StartDateTime?: Date;

    @Field({ nullable: true })
    EndDateTime: Date | null;

    @Field({ nullable: true })
    TimeZone?: string;

    @Field({ nullable: true })
    LocationType?: string;

    @Field({ nullable: true })
    LocationText: string | null;

    @Field({ nullable: true })
    VideoProvider: string | null;

    @Field({ nullable: true })
    VideoMeetingID: string | null;

    @Field({ nullable: true })
    VideoJoinURL: string | null;

    @Field({ nullable: true })
    VideoRecordingURL: string | null;

    @Field({ nullable: true })
    TranscriptURL: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CalendarEventID: string | null;

    @Field({ nullable: true })
    VideoProviderID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Meetings
//****************************************************************************
@InputType()
export class UpdatemjCommitteesMeetingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    StartDateTime?: Date;

    @Field({ nullable: true })
    EndDateTime?: Date | null;

    @Field({ nullable: true })
    TimeZone?: string;

    @Field({ nullable: true })
    LocationType?: string;

    @Field({ nullable: true })
    LocationText?: string | null;

    @Field({ nullable: true })
    VideoProvider?: string | null;

    @Field({ nullable: true })
    VideoMeetingID?: string | null;

    @Field({ nullable: true })
    VideoJoinURL?: string | null;

    @Field({ nullable: true })
    VideoRecordingURL?: string | null;

    @Field({ nullable: true })
    TranscriptURL?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CalendarEventID?: string | null;

    @Field({ nullable: true })
    VideoProviderID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Meetings
//****************************************************************************
@ObjectType()
export class RunmjCommitteesMeetingViewResult {
    @Field(() => [mjCommitteesMeeting_])
    Results: mjCommitteesMeeting_[];

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

@Resolver(mjCommitteesMeeting_)
export class mjCommitteesMeetingResolver extends ResolverBase {
    @Query(() => RunmjCommitteesMeetingViewResult)
    async RunmjCommitteesMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMeetingViewResult)
    async RunmjCommitteesMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMeetingViewResult)
    async RunmjCommitteesMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesMeeting_, { nullable: true })
    async mjCommitteesMeeting(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesMeeting_ | null> {
        this.CheckUserReadPermissions('Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMeetings')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Meetings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesMinute_])
    async mjCommitteesMinutes_ApprovedByMeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Minutes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMinutes')} WHERE ${provider.QuoteIdentifier('ApprovedByMeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Minutes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Minutes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesMinute_])
    async mjCommitteesMinutes_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Minutes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMinutes')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Minutes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Minutes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesAgendaItem_])
    async mjCommitteesAgendaItems_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Agenda Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAgendaItems')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Agenda Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Agenda Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesAttendance_])
    async mjCommitteesAttendances_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Attendances', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAttendances')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Attendances', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Attendances', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesArtifact_])
    async mjCommitteesArtifacts_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Artifacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesMotion_])
    async mjCommitteesMotions_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Motions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMotions')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Motions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Motions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesActionItem_])
    async mjCommitteesActionItems_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwActionItems')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Action Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Action Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_MeetingIDArray(@Root() mjcommitteesmeeting_: mjCommitteesMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('MeetingID')}='${mjcommitteesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesMeeting_)
    async CreatemjCommitteesMeeting(
        @Arg('input', () => CreatemjCommitteesMeetingInput) input: CreatemjCommitteesMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesMeeting_)
    async UpdatemjCommitteesMeeting(
        @Arg('input', () => UpdatemjCommitteesMeetingInput) input: UpdatemjCommitteesMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesMeeting_)
    async DeletemjCommitteesMeeting(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Memberships
//****************************************************************************
@ObjectType({ description: `Person assignments to committees with roles and terms` })
export class mjCommitteesMembership_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PersonID: string;
        
    @Field() 
    @MaxLength(36)
    RoleID: string;
        
    @Field() 
    @MaxLength(36)
    TermID: string;
        
    @Field({description: `Date the membership started`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `Date the membership ended, if applicable`}) 
    EndDate?: Date;
        
    @Field({description: `Current status: Active, Pending, Ended, or Suspended`}) 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true, description: `Reason the membership ended: Term ended, Resigned, Removed, etc.`}) 
    @MaxLength(100)
    EndReason?: string;
        
    @Field({nullable: true, description: `Additional notes about this membership`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Person: string;
        
    @Field() 
    @MaxLength(100)
    Role: string;
        
    @Field() 
    @MaxLength(100)
    Term: string;
        
    @Field(() => [mjCommitteesMotion_])
    mjCommitteesMotions_MovedByMembershipIDArray: mjCommitteesMotion_[]; // Link to mjCommitteesMotions
    
    @Field(() => [mjCommitteesVote_])
    mjCommitteesVotes_MembershipIDArray: mjCommitteesVote_[]; // Link to mjCommitteesVotes
    
    @Field(() => [mjCommitteesMotion_])
    mjCommitteesMotions_SecondedByMembershipIDArray: mjCommitteesMotion_[]; // Link to mjCommitteesMotions
    
}

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class CreatemjCommitteesMembershipInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    RoleID?: string;

    @Field({ nullable: true })
    TermID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    EndReason: string | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class UpdatemjCommitteesMembershipInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    RoleID?: string;

    @Field({ nullable: true })
    TermID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    EndReason?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Memberships
//****************************************************************************
@ObjectType()
export class RunmjCommitteesMembershipViewResult {
    @Field(() => [mjCommitteesMembership_])
    Results: mjCommitteesMembership_[];

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

@Resolver(mjCommitteesMembership_)
export class mjCommitteesMembershipResolver extends ResolverBase {
    @Query(() => RunmjCommitteesMembershipViewResult)
    async RunmjCommitteesMembershipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMembershipViewResult)
    async RunmjCommitteesMembershipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMembershipViewResult)
    async RunmjCommitteesMembershipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesMembership_, { nullable: true })
    async mjCommitteesMembership(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesMembership_ | null> {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Memberships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesMotion_])
    async mjCommitteesMotions_MovedByMembershipIDArray(@Root() mjcommitteesmembership_: mjCommitteesMembership_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Motions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMotions')} WHERE ${provider.QuoteIdentifier('MovedByMembershipID')}='${mjcommitteesmembership_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Motions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Motions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesVote_])
    async mjCommitteesVotes_MembershipIDArray(@Root() mjcommitteesmembership_: mjCommitteesMembership_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Votes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwVotes')} WHERE ${provider.QuoteIdentifier('MembershipID')}='${mjcommitteesmembership_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Votes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Votes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesMotion_])
    async mjCommitteesMotions_SecondedByMembershipIDArray(@Root() mjcommitteesmembership_: mjCommitteesMembership_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Motions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMotions')} WHERE ${provider.QuoteIdentifier('SecondedByMembershipID')}='${mjcommitteesmembership_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Motions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Motions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesMembership_)
    async CreatemjCommitteesMembership(
        @Arg('input', () => CreatemjCommitteesMembershipInput) input: CreatemjCommitteesMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesMembership_)
    async UpdatemjCommitteesMembership(
        @Arg('input', () => UpdatemjCommitteesMembershipInput) input: UpdatemjCommitteesMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesMembership_)
    async DeletemjCommitteesMembership(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Minutes
//****************************************************************************
@ObjectType({ description: `Extension entity for Minutes artifacts with approval tracking` })
export class mjCommitteesMinute_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ArtifactID?: string;
        
    @Field({description: `Current approval status: Draft, PendingApproval, Approved, Rejected`}) 
    @MaxLength(50)
    ApprovalStatus: string;
        
    @Field({nullable: true, description: `Timestamp when the minutes were approved`}) 
    ApprovedAt?: Date;
        
    @Field({nullable: true, description: `Reference to the meeting at which these minutes were approved (typically the next meeting)`}) 
    @MaxLength(36)
    ApprovedByMeetingID?: string;
        
    @Field({nullable: true, description: `Additional notes about the minutes`}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MeetingID?: string;
        
    @Field({nullable: true}) 
    Content?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ApprovedByMeeting?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Meeting?: string;
        
}

//****************************************************************************
// INPUT TYPE for Minutes
//****************************************************************************
@InputType()
export class CreatemjCommitteesMinuteInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ArtifactID: string | null;

    @Field({ nullable: true })
    ApprovalStatus?: string;

    @Field({ nullable: true })
    ApprovedAt: Date | null;

    @Field({ nullable: true })
    ApprovedByMeetingID: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    MeetingID: string | null;

    @Field({ nullable: true })
    Content: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Minutes
//****************************************************************************
@InputType()
export class UpdatemjCommitteesMinuteInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ArtifactID?: string | null;

    @Field({ nullable: true })
    ApprovalStatus?: string;

    @Field({ nullable: true })
    ApprovedAt?: Date | null;

    @Field({ nullable: true })
    ApprovedByMeetingID?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    MeetingID?: string | null;

    @Field({ nullable: true })
    Content?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Minutes
//****************************************************************************
@ObjectType()
export class RunmjCommitteesMinuteViewResult {
    @Field(() => [mjCommitteesMinute_])
    Results: mjCommitteesMinute_[];

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

@Resolver(mjCommitteesMinute_)
export class mjCommitteesMinuteResolver extends ResolverBase {
    @Query(() => RunmjCommitteesMinuteViewResult)
    async RunmjCommitteesMinuteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMinuteViewResult)
    async RunmjCommitteesMinuteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMinuteViewResult)
    async RunmjCommitteesMinuteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Minutes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesMinute_, { nullable: true })
    async mjCommitteesMinute(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesMinute_ | null> {
        this.CheckUserReadPermissions('Minutes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMinutes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Minutes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Minutes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjCommitteesMinute_)
    async CreatemjCommitteesMinute(
        @Arg('input', () => CreatemjCommitteesMinuteInput) input: CreatemjCommitteesMinuteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Minutes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesMinute_)
    async UpdatemjCommitteesMinute(
        @Arg('input', () => UpdatemjCommitteesMinuteInput) input: UpdatemjCommitteesMinuteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Minutes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesMinute_)
    async DeletemjCommitteesMinute(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Minutes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Motions
//****************************************************************************
@ObjectType({ description: `Formal motions put to vote during committee meetings` })
export class mjCommitteesMotion_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MeetingID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AgendaItemID?: string;
        
    @Field(() => Int, {description: `Display order when multiple motions exist for the same agenda item`}) 
    Sequence: number;
        
    @Field({description: `Title of the motion`}) 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true, description: `Full text or description of the motion`}) 
    Description?: string;
        
    @Field({nullable: true, description: `The committee member who made the motion`}) 
    @MaxLength(36)
    MovedByMembershipID?: string;
        
    @Field({nullable: true, description: `The committee member who seconded the motion`}) 
    @MaxLength(36)
    SecondedByMembershipID?: string;
        
    @Field({description: `Outcome of the vote: Pending, Passed, Failed, Tabled, Withdrawn`}) 
    @MaxLength(50)
    Result: string;
        
    @Field({nullable: true, description: `Human-readable vote tally, e.g. 7-2-1 or Passed unanimously`}) 
    @MaxLength(255)
    ResultSummary?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of Yes votes`}) 
    YesCount?: number;
        
    @Field(() => Int, {nullable: true, description: `Number of No votes`}) 
    NoCount?: number;
        
    @Field(() => Int, {nullable: true, description: `Number of Abstain votes`}) 
    AbstainCount?: number;
        
    @Field({nullable: true, description: `Additional notes about the motion or vote`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Meeting: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AgendaItem?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    MovedByMembership?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    SecondedByMembership?: string;
        
    @Field(() => [mjCommitteesVote_])
    mjCommitteesVotes_MotionIDArray: mjCommitteesVote_[]; // Link to mjCommitteesVotes
    
}

//****************************************************************************
// INPUT TYPE for Motions
//****************************************************************************
@InputType()
export class CreatemjCommitteesMotionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MeetingID?: string;

    @Field({ nullable: true })
    AgendaItemID: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    MovedByMembershipID: string | null;

    @Field({ nullable: true })
    SecondedByMembershipID: string | null;

    @Field({ nullable: true })
    Result?: string;

    @Field({ nullable: true })
    ResultSummary: string | null;

    @Field(() => Int, { nullable: true })
    YesCount: number | null;

    @Field(() => Int, { nullable: true })
    NoCount: number | null;

    @Field(() => Int, { nullable: true })
    AbstainCount: number | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Motions
//****************************************************************************
@InputType()
export class UpdatemjCommitteesMotionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MeetingID?: string;

    @Field({ nullable: true })
    AgendaItemID?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    MovedByMembershipID?: string | null;

    @Field({ nullable: true })
    SecondedByMembershipID?: string | null;

    @Field({ nullable: true })
    Result?: string;

    @Field({ nullable: true })
    ResultSummary?: string | null;

    @Field(() => Int, { nullable: true })
    YesCount?: number | null;

    @Field(() => Int, { nullable: true })
    NoCount?: number | null;

    @Field(() => Int, { nullable: true })
    AbstainCount?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Motions
//****************************************************************************
@ObjectType()
export class RunmjCommitteesMotionViewResult {
    @Field(() => [mjCommitteesMotion_])
    Results: mjCommitteesMotion_[];

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

@Resolver(mjCommitteesMotion_)
export class mjCommitteesMotionResolver extends ResolverBase {
    @Query(() => RunmjCommitteesMotionViewResult)
    async RunmjCommitteesMotionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMotionViewResult)
    async RunmjCommitteesMotionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesMotionViewResult)
    async RunmjCommitteesMotionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Motions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesMotion_, { nullable: true })
    async mjCommitteesMotion(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesMotion_ | null> {
        this.CheckUserReadPermissions('Motions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMotions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Motions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Motions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesVote_])
    async mjCommitteesVotes_MotionIDArray(@Root() mjcommitteesmotion_: mjCommitteesMotion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Votes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwVotes')} WHERE ${provider.QuoteIdentifier('MotionID')}='${mjcommitteesmotion_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Votes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Votes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesMotion_)
    async CreatemjCommitteesMotion(
        @Arg('input', () => CreatemjCommitteesMotionInput) input: CreatemjCommitteesMotionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Motions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesMotion_)
    async UpdatemjCommitteesMotion(
        @Arg('input', () => UpdatemjCommitteesMotionInput) input: UpdatemjCommitteesMotionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Motions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesMotion_)
    async DeletemjCommitteesMotion(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Motions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organization Types
//****************************************************************************
@ObjectType({ description: `Categories of organizations such as Company, Non-Profit, Association, Government` })
export class mjBizAppsCommonOrganizationType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the organization type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this organization type`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonOrganization_])
    mjBizAppsCommonOrganizations_OrganizationTypeIDArray: mjBizAppsCommonOrganization_[]; // Link to mjBizAppsCommonOrganizations
    
}

//****************************************************************************
// INPUT TYPE for Organization Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonOrganizationTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    IconClass: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organization Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonOrganizationTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organization Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonOrganizationTypeViewResult {
    @Field(() => [mjBizAppsCommonOrganizationType_])
    Results: mjBizAppsCommonOrganizationType_[];

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

@Resolver(mjBizAppsCommonOrganizationType_)
export class mjBizAppsCommonOrganizationTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonOrganizationTypeViewResult)
    async RunmjBizAppsCommonOrganizationTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationTypeViewResult)
    async RunmjBizAppsCommonOrganizationTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationTypeViewResult)
    async RunmjBizAppsCommonOrganizationTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organization Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonOrganizationType_, { nullable: true })
    async mjBizAppsCommonOrganizationType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonOrganizationType_ | null> {
        this.CheckUserReadPermissions('Organization Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizationTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organization Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organization Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonOrganization_])
    async mjBizAppsCommonOrganizations_OrganizationTypeIDArray(@Root() mjbizappscommonorganizationtype_: mjBizAppsCommonOrganizationType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('OrganizationTypeID')}='${mjbizappscommonorganizationtype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonOrganizationType_)
    async CreatemjBizAppsCommonOrganizationType(
        @Arg('input', () => CreatemjBizAppsCommonOrganizationTypeInput) input: CreatemjBizAppsCommonOrganizationTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organization Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonOrganizationType_)
    async UpdatemjBizAppsCommonOrganizationType(
        @Arg('input', () => UpdatemjBizAppsCommonOrganizationTypeInput) input: UpdatemjBizAppsCommonOrganizationTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organization Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonOrganizationType_)
    async DeletemjBizAppsCommonOrganizationType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organization Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organizations
//****************************************************************************
@ObjectType({ description: `Companies, associations, government bodies, and other organizations with hierarchy support` })
export class mjBizAppsCommonOrganization_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Common or display name of the organization`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Full legal name if different from display name`}) 
    @MaxLength(255)
    LegalName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrganizationTypeID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field({nullable: true, description: `Primary website URL`}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true, description: `URL to organization logo image`}) 
    @MaxLength(1000)
    LogoURL?: string;
        
    @Field({nullable: true, description: `Description of the organization purpose and scope`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Primary contact email address`}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true, description: `Primary phone number`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true, description: `Date the organization was founded or incorporated`}) 
    FoundedDate?: Date;
        
    @Field({nullable: true, description: `Tax identification number such as EIN`}) 
    @MaxLength(50)
    TaxID?: string;
        
    @Field({description: `Current status: Active, Inactive, or Dissolved`}) 
    @MaxLength(50)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    OrganizationType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field(() => [mjBizAppsCommonOrganization_])
    mjBizAppsCommonOrganizations_ParentIDArray: mjBizAppsCommonOrganization_[]; // Link to mjBizAppsCommonOrganizations
    
    @Field(() => [mjCommitteesCommittee_])
    mjCommitteesCommittees_OrganizationIDArray: mjCommitteesCommittee_[]; // Link to mjCommitteesCommittees
    
    @Field(() => [mjBizAppsCommonContactMethod_])
    mjBizAppsCommonContactMethods_OrganizationIDArray: mjBizAppsCommonContactMethod_[]; // Link to mjBizAppsCommonContactMethods
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_ToOrganizationIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_FromOrganizationIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
}

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonOrganizationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    LegalName: string | null;

    @Field({ nullable: true })
    OrganizationTypeID: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    LogoURL: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    FoundedDate: Date | null;

    @Field({ nullable: true })
    TaxID: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonOrganizationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    LegalName?: string | null;

    @Field({ nullable: true })
    OrganizationTypeID?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    LogoURL?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    FoundedDate?: Date | null;

    @Field({ nullable: true })
    TaxID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organizations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonOrganizationViewResult {
    @Field(() => [mjBizAppsCommonOrganization_])
    Results: mjBizAppsCommonOrganization_[];

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

@Resolver(mjBizAppsCommonOrganization_)
export class mjBizAppsCommonOrganizationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonOrganizationViewResult)
    async RunmjBizAppsCommonOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationViewResult)
    async RunmjBizAppsCommonOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationViewResult)
    async RunmjBizAppsCommonOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonOrganization_, { nullable: true })
    async mjBizAppsCommonOrganization(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonOrganization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organizations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonOrganization_])
    async mjBizAppsCommonOrganizations_ParentIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('ParentID')}='${mjbizappscommonorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesCommittee_])
    async mjCommitteesCommittees_OrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwCommittees')} WHERE ${provider.QuoteIdentifier('OrganizationID')}='${mjbizappscommonorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonContactMethod_])
    async mjBizAppsCommonContactMethods_OrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('OrganizationID')}='${mjbizappscommonorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_ToOrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('ToOrganizationID')}='${mjbizappscommonorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_FromOrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('FromOrganizationID')}='${mjbizappscommonorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonOrganization_)
    async CreatemjBizAppsCommonOrganization(
        @Arg('input', () => CreatemjBizAppsCommonOrganizationInput) input: CreatemjBizAppsCommonOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonOrganization_)
    async UpdatemjBizAppsCommonOrganization(
        @Arg('input', () => UpdatemjBizAppsCommonOrganizationInput) input: UpdatemjBizAppsCommonOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonOrganization_)
    async DeletemjBizAppsCommonOrganization(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for People
//****************************************************************************
@ObjectType({ description: `Individual people, optionally linked to MJ system user accounts` })
export class mjBizAppsCommonPerson_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `First (given) name`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Last (family) name`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true, description: `Middle name or initial`}) 
    @MaxLength(100)
    MiddleName?: string;
        
    @Field({nullable: true, description: `Name prefix such as Dr., Mr., Ms., Rev.`}) 
    @MaxLength(20)
    Prefix?: string;
        
    @Field({nullable: true, description: `Name suffix such as Jr., III, PhD, Esq.`}) 
    @MaxLength(20)
    Suffix?: string;
        
    @Field({nullable: true, description: `Nickname or preferred name the person goes by`}) 
    @MaxLength(100)
    PreferredName?: string;
        
    @Field({nullable: true, description: `Professional or job title, e.g. VP of Engineering, Board Director`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `Primary email address for this person`}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true, description: `Primary phone number for this person`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true, description: `Date of birth`}) 
    DateOfBirth?: Date;
        
    @Field({nullable: true, description: `Gender identity`}) 
    @MaxLength(50)
    Gender?: string;
        
    @Field({nullable: true, description: `URL to profile photo or avatar image`}) 
    @MaxLength(1000)
    PhotoURL?: string;
        
    @Field({nullable: true, description: `Biographical text or notes about this person`}) 
    Bio?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    LinkedUserID?: string;
        
    @Field({description: `Current status: Active, Inactive, or Deceased`}) 
    @MaxLength(50)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LinkedUser?: string;
        
    @Field(() => [mjCommitteesActionItem_])
    mjCommitteesActionItems_AssignedByPersonIDArray: mjCommitteesActionItem_[]; // Link to mjCommitteesActionItems
    
    @Field(() => [mjCommitteesAgendaItem_])
    mjCommitteesAgendaItems_PresenterPersonIDArray: mjCommitteesAgendaItem_[]; // Link to mjCommitteesAgendaItems
    
    @Field(() => [mjCommitteesAttendance_])
    mjCommitteesAttendances_PersonIDArray: mjCommitteesAttendance_[]; // Link to mjCommitteesAttendances
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_FromPersonIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
    @Field(() => [mjCommitteesMembership_])
    mjCommitteesMemberships_PersonIDArray: mjCommitteesMembership_[]; // Link to mjCommitteesMemberships
    
    @Field(() => [mjCommitteesArtifact_])
    mjCommitteesArtifacts_UploadedByPersonIDArray: mjCommitteesArtifact_[]; // Link to mjCommitteesArtifacts
    
    @Field(() => [mjCommitteesComment_])
    mjCommitteesComments_PersonIDArray: mjCommitteesComment_[]; // Link to mjCommitteesComments
    
    @Field(() => [mjCommitteesActionItem_])
    mjCommitteesActionItems_AssignedToPersonIDArray: mjCommitteesActionItem_[]; // Link to mjCommitteesActionItems
    
    @Field(() => [mjBizAppsCommonContactMethod_])
    mjBizAppsCommonContactMethods_PersonIDArray: mjBizAppsCommonContactMethod_[]; // Link to mjBizAppsCommonContactMethods
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_ToPersonIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
}

//****************************************************************************
// INPUT TYPE for People
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonPersonInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    MiddleName: string | null;

    @Field({ nullable: true })
    Prefix: string | null;

    @Field({ nullable: true })
    Suffix: string | null;

    @Field({ nullable: true })
    PreferredName: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    DateOfBirth: Date | null;

    @Field({ nullable: true })
    Gender: string | null;

    @Field({ nullable: true })
    PhotoURL: string | null;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    LinkedUserID: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for People
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonPersonInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    MiddleName?: string | null;

    @Field({ nullable: true })
    Prefix?: string | null;

    @Field({ nullable: true })
    Suffix?: string | null;

    @Field({ nullable: true })
    PreferredName?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    DateOfBirth?: Date | null;

    @Field({ nullable: true })
    Gender?: string | null;

    @Field({ nullable: true })
    PhotoURL?: string | null;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    LinkedUserID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for People
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonPersonViewResult {
    @Field(() => [mjBizAppsCommonPerson_])
    Results: mjBizAppsCommonPerson_[];

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

@Resolver(mjBizAppsCommonPerson_)
export class mjBizAppsCommonPersonResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonPersonViewResult)
    async RunmjBizAppsCommonPersonViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonPersonViewResult)
    async RunmjBizAppsCommonPersonViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonPersonViewResult)
    async RunmjBizAppsCommonPersonDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'People';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonPerson_, { nullable: true })
    async mjBizAppsCommonPerson(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonPerson_ | null> {
        this.CheckUserReadPermissions('People', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwPeople')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'People', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('People', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesActionItem_])
    async mjCommitteesActionItems_AssignedByPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwActionItems')} WHERE ${provider.QuoteIdentifier('AssignedByPersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Action Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Action Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesAgendaItem_])
    async mjCommitteesAgendaItems_PresenterPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Agenda Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAgendaItems')} WHERE ${provider.QuoteIdentifier('PresenterPersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Agenda Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Agenda Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesAttendance_])
    async mjCommitteesAttendances_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Attendances', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwAttendances')} WHERE ${provider.QuoteIdentifier('PersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Attendances', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Attendances', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_FromPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('FromPersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesMembership_])
    async mjCommitteesMemberships_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('PersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesArtifact_])
    async mjCommitteesArtifacts_UploadedByPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Artifacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwArtifacts')} WHERE ${provider.QuoteIdentifier('UploadedByPersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Artifacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Artifacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesComment_])
    async mjCommitteesComments_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwComments')} WHERE ${provider.QuoteIdentifier('PersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjCommitteesActionItem_])
    async mjCommitteesActionItems_AssignedToPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwActionItems')} WHERE ${provider.QuoteIdentifier('AssignedToPersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Action Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Action Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonContactMethod_])
    async mjBizAppsCommonContactMethods_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('PersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_ToPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('ToPersonID')}='${mjbizappscommonperson_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonPerson_)
    async CreatemjBizAppsCommonPerson(
        @Arg('input', () => CreatemjBizAppsCommonPersonInput) input: CreatemjBizAppsCommonPersonInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('People', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonPerson_)
    async UpdatemjBizAppsCommonPerson(
        @Arg('input', () => UpdatemjBizAppsCommonPersonInput) input: UpdatemjBizAppsCommonPersonInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('People', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonPerson_)
    async DeletemjBizAppsCommonPerson(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('People', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Relationship Types
//****************************************************************************
@ObjectType({ description: `Defines types of relationships between people and organizations with directionality and labeling` })
export class mjBizAppsCommonRelationshipType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the relationship type, e.g. Employee, Spouse, Partner`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this relationship type`}) 
    Description?: string;
        
    @Field({description: `Which entity types this relationship connects: PersonToPerson, PersonToOrganization, or OrganizationToOrganization`}) 
    @MaxLength(50)
    Category: string;
        
    @Field(() => Boolean, {description: `Whether the relationship has a direction. False for symmetric relationships like Spouse or Partner`}) 
    IsDirectional: boolean;
        
    @Field({nullable: true, description: `Label describing the From-to-To direction, e.g. is employee of, is parent of`}) 
    @MaxLength(100)
    ForwardLabel?: string;
        
    @Field({nullable: true, description: `Label describing the To-to-From direction, e.g. employs, is child of`}) 
    @MaxLength(100)
    ReverseLabel?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_RelationshipTypeIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
}

//****************************************************************************
// INPUT TYPE for Relationship Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonRelationshipTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field(() => Boolean, { nullable: true })
    IsDirectional?: boolean;

    @Field({ nullable: true })
    ForwardLabel: string | null;

    @Field({ nullable: true })
    ReverseLabel: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Relationship Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonRelationshipTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field(() => Boolean, { nullable: true })
    IsDirectional?: boolean;

    @Field({ nullable: true })
    ForwardLabel?: string | null;

    @Field({ nullable: true })
    ReverseLabel?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Relationship Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonRelationshipTypeViewResult {
    @Field(() => [mjBizAppsCommonRelationshipType_])
    Results: mjBizAppsCommonRelationshipType_[];

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

@Resolver(mjBizAppsCommonRelationshipType_)
export class mjBizAppsCommonRelationshipTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonRelationshipTypeViewResult)
    async RunmjBizAppsCommonRelationshipTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipTypeViewResult)
    async RunmjBizAppsCommonRelationshipTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipTypeViewResult)
    async RunmjBizAppsCommonRelationshipTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Relationship Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonRelationshipType_, { nullable: true })
    async mjBizAppsCommonRelationshipType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonRelationshipType_ | null> {
        this.CheckUserReadPermissions('Relationship Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationshipTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationship Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Relationship Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_RelationshipTypeIDArray(@Root() mjbizappscommonrelationshiptype_: mjBizAppsCommonRelationshipType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('RelationshipTypeID')}='${mjbizappscommonrelationshiptype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonRelationshipType_)
    async CreatemjBizAppsCommonRelationshipType(
        @Arg('input', () => CreatemjBizAppsCommonRelationshipTypeInput) input: CreatemjBizAppsCommonRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Relationship Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonRelationshipType_)
    async UpdatemjBizAppsCommonRelationshipType(
        @Arg('input', () => UpdatemjBizAppsCommonRelationshipTypeInput) input: UpdatemjBizAppsCommonRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Relationship Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonRelationshipType_)
    async DeletemjBizAppsCommonRelationshipType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Relationship Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Relationships
//****************************************************************************
@ObjectType({ description: `Typed, directional links between people and organizations supporting Person-to-Person, Person-to-Organization, and Organization-to-Organization relationships` })
export class mjBizAppsCommonRelationship_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    RelationshipTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    FromPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    FromOrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ToPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ToOrganizationID?: string;
        
    @Field({nullable: true, description: `Contextual title for this specific relationship, e.g. CEO, Primary Contact, Founding Member`}) 
    @MaxLength(255)
    Title?: string;
        
    @Field({nullable: true, description: `Date the relationship began`}) 
    StartDate?: Date;
        
    @Field({nullable: true, description: `Date the relationship ended, if applicable`}) 
    EndDate?: Date;
        
    @Field({description: `Current status: Active, Inactive, or Ended`}) 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true, description: `Additional notes about this relationship`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    RelationshipType: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FromPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    FromOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ToOrganization?: string;
        
}

//****************************************************************************
// INPUT TYPE for Relationships
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonRelationshipInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    RelationshipTypeID?: string;

    @Field({ nullable: true })
    FromPersonID: string | null;

    @Field({ nullable: true })
    FromOrganizationID: string | null;

    @Field({ nullable: true })
    ToPersonID: string | null;

    @Field({ nullable: true })
    ToOrganizationID: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Relationships
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonRelationshipInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    RelationshipTypeID?: string;

    @Field({ nullable: true })
    FromPersonID?: string | null;

    @Field({ nullable: true })
    FromOrganizationID?: string | null;

    @Field({ nullable: true })
    ToPersonID?: string | null;

    @Field({ nullable: true })
    ToOrganizationID?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Relationships
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonRelationshipViewResult {
    @Field(() => [mjBizAppsCommonRelationship_])
    Results: mjBizAppsCommonRelationship_[];

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

@Resolver(mjBizAppsCommonRelationship_)
export class mjBizAppsCommonRelationshipResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonRelationshipViewResult)
    async RunmjBizAppsCommonRelationshipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipViewResult)
    async RunmjBizAppsCommonRelationshipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipViewResult)
    async RunmjBizAppsCommonRelationshipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Relationships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonRelationship_, { nullable: true })
    async mjBizAppsCommonRelationship(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonRelationship_ | null> {
        this.CheckUserReadPermissions('Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Relationships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsCommonRelationship_)
    async CreatemjBizAppsCommonRelationship(
        @Arg('input', () => CreatemjBizAppsCommonRelationshipInput) input: CreatemjBizAppsCommonRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Relationships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonRelationship_)
    async UpdatemjBizAppsCommonRelationship(
        @Arg('input', () => UpdatemjBizAppsCommonRelationshipInput) input: UpdatemjBizAppsCommonRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Relationships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonRelationship_)
    async DeletemjBizAppsCommonRelationship(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Relationships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Roles
//****************************************************************************
@ObjectType({ description: `Roles that members can hold on committees` })
export class mjCommitteesRole_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the role`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of role responsibilities`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this is an officer role like Chair or Secretary`}) 
    IsOfficer: boolean;
        
    @Field(() => Boolean, {description: `Whether members in this role can vote`}) 
    IsVotingRole: boolean;
        
    @Field({nullable: true, description: `JSON object defining default permissions for this role`}) 
    DefaultPermissionsJSON?: string;
        
    @Field(() => Int, {description: `Display order for sorting roles`}) 
    Sequence: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjCommitteesMembership_])
    mjCommitteesMemberships_RoleIDArray: mjCommitteesMembership_[]; // Link to mjCommitteesMemberships
    
}

//****************************************************************************
// INPUT TYPE for Roles
//****************************************************************************
@InputType()
export class CreatemjCommitteesRoleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsOfficer?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsVotingRole?: boolean;

    @Field({ nullable: true })
    DefaultPermissionsJSON: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;
}
    

//****************************************************************************
// INPUT TYPE for Roles
//****************************************************************************
@InputType()
export class UpdatemjCommitteesRoleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsOfficer?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsVotingRole?: boolean;

    @Field({ nullable: true })
    DefaultPermissionsJSON?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Roles
//****************************************************************************
@ObjectType()
export class RunmjCommitteesRoleViewResult {
    @Field(() => [mjCommitteesRole_])
    Results: mjCommitteesRole_[];

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

@Resolver(mjCommitteesRole_)
export class mjCommitteesRoleResolver extends ResolverBase {
    @Query(() => RunmjCommitteesRoleViewResult)
    async RunmjCommitteesRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesRoleViewResult)
    async RunmjCommitteesRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesRoleViewResult)
    async RunmjCommitteesRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Roles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesRole_, { nullable: true })
    async mjCommitteesRole(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesRole_ | null> {
        this.CheckUserReadPermissions('Roles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwRoles')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Roles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Roles', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesMembership_])
    async mjCommitteesMemberships_RoleIDArray(@Root() mjcommitteesrole_: mjCommitteesRole_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('RoleID')}='${mjcommitteesrole_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesRole_)
    async CreatemjCommitteesRole(
        @Arg('input', () => CreatemjCommitteesRoleInput) input: CreatemjCommitteesRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Roles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesRole_)
    async UpdatemjCommitteesRole(
        @Arg('input', () => UpdatemjCommitteesRoleInput) input: UpdatemjCommitteesRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Roles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesRole_)
    async DeletemjCommitteesRole(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Roles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Terms
//****************************************************************************
@ObjectType({ description: `Time periods for committee membership cycles` })
export class mjCommitteesTerm_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CommitteeID: string;
        
    @Field({description: `Display name for the term, e.g. 2025-2026`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({description: `Start date of the term`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of the term`}) 
    EndDate?: Date;
        
    @Field({description: `Current status: Active, Upcoming, or Completed`}) 
    @MaxLength(50)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Committee: string;
        
    @Field(() => [mjCommitteesMembership_])
    mjCommitteesMemberships_TermIDArray: mjCommitteesMembership_[]; // Link to mjCommitteesMemberships
    
}

//****************************************************************************
// INPUT TYPE for Terms
//****************************************************************************
@InputType()
export class CreatemjCommitteesTermInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Terms
//****************************************************************************
@InputType()
export class UpdatemjCommitteesTermInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Terms
//****************************************************************************
@ObjectType()
export class RunmjCommitteesTermViewResult {
    @Field(() => [mjCommitteesTerm_])
    Results: mjCommitteesTerm_[];

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

@Resolver(mjCommitteesTerm_)
export class mjCommitteesTermResolver extends ResolverBase {
    @Query(() => RunmjCommitteesTermViewResult)
    async RunmjCommitteesTermViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesTermViewResult)
    async RunmjCommitteesTermViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesTermViewResult)
    async RunmjCommitteesTermDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Terms';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesTerm_, { nullable: true })
    async mjCommitteesTerm(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesTerm_ | null> {
        this.CheckUserReadPermissions('Terms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwTerms')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Terms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Terms', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesMembership_])
    async mjCommitteesMemberships_TermIDArray(@Root() mjcommitteesterm_: mjCommitteesTerm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('TermID')}='${mjcommitteesterm_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesTerm_)
    async CreatemjCommitteesTerm(
        @Arg('input', () => CreatemjCommitteesTermInput) input: CreatemjCommitteesTermInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Terms', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesTerm_)
    async UpdatemjCommitteesTerm(
        @Arg('input', () => UpdatemjCommitteesTermInput) input: UpdatemjCommitteesTermInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Terms', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesTerm_)
    async DeletemjCommitteesTerm(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Terms', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Types
//****************************************************************************
@ObjectType({ description: `Categories of committees such as Board, Standing, Ad Hoc, Workgroup` })
export class mjCommitteesType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the committee type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this committee type`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this type is for standards development committees`}) 
    IsStandards: boolean;
        
    @Field(() => Int, {nullable: true, description: `Default term length in months for committees of this type`}) 
    DefaultTermMonths?: number;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjCommitteesCommittee_])
    mjCommitteesCommittees_TypeIDArray: mjCommitteesCommittee_[]; // Link to mjCommitteesCommittees
    
}

//****************************************************************************
// INPUT TYPE for Types
//****************************************************************************
@InputType()
export class CreatemjCommitteesTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsStandards?: boolean;

    @Field(() => Int, { nullable: true })
    DefaultTermMonths: number | null;

    @Field({ nullable: true })
    IconClass: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Types
//****************************************************************************
@InputType()
export class UpdatemjCommitteesTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsStandards?: boolean;

    @Field(() => Int, { nullable: true })
    DefaultTermMonths?: number | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Types
//****************************************************************************
@ObjectType()
export class RunmjCommitteesTypeViewResult {
    @Field(() => [mjCommitteesType_])
    Results: mjCommitteesType_[];

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

@Resolver(mjCommitteesType_)
export class mjCommitteesTypeResolver extends ResolverBase {
    @Query(() => RunmjCommitteesTypeViewResult)
    async RunmjCommitteesTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesTypeViewResult)
    async RunmjCommitteesTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesTypeViewResult)
    async RunmjCommitteesTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesType_, { nullable: true })
    async mjCommitteesType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesType_ | null> {
        this.CheckUserReadPermissions('Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesCommittee_])
    async mjCommitteesCommittees_TypeIDArray(@Root() mjcommitteestype_: mjCommitteesType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwCommittees')} WHERE ${provider.QuoteIdentifier('TypeID')}='${mjcommitteestype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesType_)
    async CreatemjCommitteesType(
        @Arg('input', () => CreatemjCommitteesTypeInput) input: CreatemjCommitteesTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesType_)
    async UpdatemjCommitteesType(
        @Arg('input', () => UpdatemjCommitteesTypeInput) input: UpdatemjCommitteesTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesType_)
    async DeletemjCommitteesType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Video Providers
//****************************************************************************
@ObjectType()
export class mjCommitteesVideoProvider_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    Name: string;
        
    @Field() 
    @MaxLength(100)
    ServerDriverKey: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field(() => Boolean) 
    IsDefault: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CredentialID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Credential?: string;
        
    @Field(() => [mjCommitteesMeeting_])
    mjCommitteesMeetings_VideoProviderIDArray: mjCommitteesMeeting_[]; // Link to mjCommitteesMeetings
    
}

//****************************************************************************
// INPUT TYPE for Video Providers
//****************************************************************************
@InputType()
export class CreatemjCommitteesVideoProviderInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ServerDriverKey?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field({ nullable: true })
    CredentialID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Video Providers
//****************************************************************************
@InputType()
export class UpdatemjCommitteesVideoProviderInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ServerDriverKey?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field({ nullable: true })
    CredentialID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Video Providers
//****************************************************************************
@ObjectType()
export class RunmjCommitteesVideoProviderViewResult {
    @Field(() => [mjCommitteesVideoProvider_])
    Results: mjCommitteesVideoProvider_[];

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

@Resolver(mjCommitteesVideoProvider_)
export class mjCommitteesVideoProviderResolver extends ResolverBase {
    @Query(() => RunmjCommitteesVideoProviderViewResult)
    async RunmjCommitteesVideoProviderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesVideoProviderViewResult)
    async RunmjCommitteesVideoProviderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesVideoProviderViewResult)
    async RunmjCommitteesVideoProviderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Video Providers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesVideoProvider_, { nullable: true })
    async mjCommitteesVideoProvider(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesVideoProvider_ | null> {
        this.CheckUserReadPermissions('Video Providers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwVideoProviders')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Video Providers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Video Providers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjCommitteesMeeting_])
    async mjCommitteesMeetings_VideoProviderIDArray(@Root() mjcommitteesvideoprovider_: mjCommitteesVideoProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwMeetings')} WHERE ${provider.QuoteIdentifier('VideoProviderID')}='${mjcommitteesvideoprovider_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjCommitteesVideoProvider_)
    async CreatemjCommitteesVideoProvider(
        @Arg('input', () => CreatemjCommitteesVideoProviderInput) input: CreatemjCommitteesVideoProviderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Video Providers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesVideoProvider_)
    async UpdatemjCommitteesVideoProvider(
        @Arg('input', () => UpdatemjCommitteesVideoProviderInput) input: UpdatemjCommitteesVideoProviderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Video Providers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesVideoProvider_)
    async DeletemjCommitteesVideoProvider(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Video Providers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Votes
//****************************************************************************
@ObjectType({ description: `Individual vote records for committee motions` })
export class mjCommitteesVote_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MotionID: string;
        
    @Field() 
    @MaxLength(36)
    MembershipID: string;
        
    @Field({description: `The vote cast: Yes, No, Abstain, or Absent`}) 
    @MaxLength(20)
    VoteValue: string;
        
    @Field({nullable: true, description: `Optional notes explaining the vote`}) 
    @MaxLength(500)
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Motion: string;
        
    @Field() 
    @MaxLength(100)
    Membership: string;
        
}

//****************************************************************************
// INPUT TYPE for Votes
//****************************************************************************
@InputType()
export class CreatemjCommitteesVoteInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MotionID?: string;

    @Field({ nullable: true })
    MembershipID?: string;

    @Field({ nullable: true })
    VoteValue?: string;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Votes
//****************************************************************************
@InputType()
export class UpdatemjCommitteesVoteInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MotionID?: string;

    @Field({ nullable: true })
    MembershipID?: string;

    @Field({ nullable: true })
    VoteValue?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Votes
//****************************************************************************
@ObjectType()
export class RunmjCommitteesVoteViewResult {
    @Field(() => [mjCommitteesVote_])
    Results: mjCommitteesVote_[];

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

@Resolver(mjCommitteesVote_)
export class mjCommitteesVoteResolver extends ResolverBase {
    @Query(() => RunmjCommitteesVoteViewResult)
    async RunmjCommitteesVoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesVoteViewResult)
    async RunmjCommitteesVoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjCommitteesVoteViewResult)
    async RunmjCommitteesVoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Votes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjCommitteesVote_, { nullable: true })
    async mjCommitteesVote(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjCommitteesVote_ | null> {
        this.CheckUserReadPermissions('Votes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_Committees', 'vwVotes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Votes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Votes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjCommitteesVote_)
    async CreatemjCommitteesVote(
        @Arg('input', () => CreatemjCommitteesVoteInput) input: CreatemjCommitteesVoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Votes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjCommitteesVote_)
    async UpdatemjCommitteesVote(
        @Arg('input', () => UpdatemjCommitteesVoteInput) input: UpdatemjCommitteesVoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Votes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjCommitteesVote_)
    async DeletemjCommitteesVote(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Votes', key, options, provider, userPayload, pubSub);
    }
    
}