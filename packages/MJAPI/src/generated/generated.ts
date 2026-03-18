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


import { YourMembershipAllCampaignEntity, YourMembershipAnnouncementEntity, HubSpotCallEntity, YourMembershipCampaignEmailListEntity, YourMembershipCampaignEntity, YourMembershipCareerOpeningEntity, YourMembershipCertificationCreditTypeEntity, YourMembershipCertificationJournalEntity, YourMembershipCertificationEntity, HubSpotCompanyEntity, HubSpotCompanyCallEntity, HubSpotCompanyDealEntity, HubSpotCompanyEmailEntity, HubSpotCompanyMeetingEntity, HubSpotCompanyNoteEntity, HubSpotCompanyTaskEntity, HubSpotCompanyTicketEntity, YourMembershipConnectionEntity, HubSpotContactCallEntity, HubSpotContactCompanyEntity, HubSpotContactDealEntity, HubSpotContactEmailEntity, HubSpotContactFeedbackSubmissionEntity, HubSpotContactMeetingEntity, HubSpotContactNoteEntity, HubSpotContactTaskEntity, HubSpotContactTicketEntity, HubSpotContactEntity, YourMembershipCountryEntity, YourMembershipCustomTaxLocationEntity, HubSpotDealCallEntity, HubSpotDealEmailEntity, HubSpotDealLineItemEntity, HubSpotDealMeetingEntity, HubSpotDealNoteEntity, HubSpotDealQuoteEntity, HubSpotDealTaskEntity, HubSpotDealEntity, YourMembershipDonationFundEntity, YourMembershipDonationHistoryEntity, YourMembershipDonationTransactionEntity, YourMembershipDuesRuleEntity, YourMembershipDuesTransactionEntity, YourMembershipEmailSuppressionListEntity, HubSpotEmailEntity, YourMembershipEngagementScoreEntity, YourMembershipEventAttendeeTypeEntity, YourMembershipEventCategoryEntity, YourMembershipEventCEUAwardEntity, YourMembershipEventIDEntity, YourMembershipEventRegistrationFormEntity, YourMembershipEventRegistrationEntity, YourMembershipEventSessionGroupEntity, YourMembershipEventSessionEntity, YourMembershipEventTicketEntity, YourMembershipEventEntity, HubSpotFeedbackSubmissionEntity, YourMembershipFinanceBatchDetailEntity, YourMembershipFinanceBatchEntity, YourMembershipGLCodeEntity, YourMembershipGroupMembershipLogEntity, YourMembershipGroupTypeEntity, YourMembershipGroupEntity, YourMembershipInvoiceItemEntity, HubSpotLineItemEntity, YourMembershipLocationEntity, HubSpotMeetingEntity, YourMembershipMemberFavoriteEntity, YourMembershipMemberGroupBulkEntity, YourMembershipMemberGroupEntity, YourMembershipMemberNetworkEntity, YourMembershipMemberProfileEntity, YourMembershipMemberReferralEntity, YourMembershipMemberSubAccountEntity, YourMembershipMemberTypeEntity, YourMembershipMemberEntity, YourMembershipMembershipModifierEntity, YourMembershipMembershipPromoCodeEntity, YourMembershipMembershipEntity, HubSpotNoteEntity, YourMembershipPaymentProcessorEntity, YourMembershipPersonIDEntity, YourMembershipProductCategoryEntity, YourMembershipProductEntity, HubSpotProduct__HubSpotEntity, YourMembershipQBClassEntity, HubSpotQuoteContactEntity, HubSpotQuoteLineItemEntity, HubSpotQuoteEntity, YourMembershipShippingMethodEntity, YourMembershipSponsorRotatorEntity, YourMembershipStoreOrderDetailEntity, YourMembershipStoreOrderEntity, HubSpotTaskEntity, HubSpotTicketCallEntity, HubSpotTicketEmailEntity, HubSpotTicketFeedbackSubmissionEntity, HubSpotTicketMeetingEntity, HubSpotTicketNoteEntity, HubSpotTicketTaskEntity, HubSpotTicketEntity, YourMembershipTimeZoneEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for All Campaigns
//****************************************************************************
@ObjectType({ description: `Extended campaign data with scheduling, processing counts, categories, and version info` })
export class YourMembershipAllCampaign_ {
    @Field(() => Int) 
    CampaignId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CampaignName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Subject?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Type?: string;
        
    @Field({nullable: true}) 
    DateScheduled?: Date;
        
    @Field({nullable: true}) 
    DateSent?: Date;
        
    @Field(() => Int, {nullable: true}) 
    ProcessingCount?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for All Campaigns
//****************************************************************************
@InputType()
export class CreateYourMembershipAllCampaignInput {
    @Field(() => Int, { nullable: true })
    CampaignId?: number;

    @Field({ nullable: true })
    CampaignName: string | null;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    Category: string | null;

    @Field({ nullable: true })
    Type: string | null;

    @Field({ nullable: true })
    DateScheduled: Date | null;

    @Field({ nullable: true })
    DateSent: Date | null;

    @Field(() => Int, { nullable: true })
    ProcessingCount: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for All Campaigns
//****************************************************************************
@InputType()
export class UpdateYourMembershipAllCampaignInput {
    @Field(() => Int)
    CampaignId: number;

    @Field({ nullable: true })
    CampaignName?: string | null;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Category?: string | null;

    @Field({ nullable: true })
    Type?: string | null;

    @Field({ nullable: true })
    DateScheduled?: Date | null;

    @Field({ nullable: true })
    DateSent?: Date | null;

    @Field(() => Int, { nullable: true })
    ProcessingCount?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for All Campaigns
//****************************************************************************
@ObjectType()
export class RunYourMembershipAllCampaignViewResult {
    @Field(() => [YourMembershipAllCampaign_])
    Results: YourMembershipAllCampaign_[];

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

@Resolver(YourMembershipAllCampaign_)
export class YourMembershipAllCampaignResolver extends ResolverBase {
    @Query(() => RunYourMembershipAllCampaignViewResult)
    async RunYourMembershipAllCampaignViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipAllCampaignViewResult)
    async RunYourMembershipAllCampaignViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipAllCampaignViewResult)
    async RunYourMembershipAllCampaignDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'All Campaigns';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipAllCampaign_, { nullable: true })
    async YourMembershipAllCampaign(@Arg('CampaignId', () => Int) CampaignId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipAllCampaign_ | null> {
        this.CheckUserReadPermissions('All Campaigns', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwAllCampaigns')} WHERE ${provider.QuoteIdentifier('CampaignId')}=${CampaignId} ` + this.getRowLevelSecurityWhereClause(provider, 'All Campaigns', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('All Campaigns', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipAllCampaign_)
    async CreateYourMembershipAllCampaign(
        @Arg('input', () => CreateYourMembershipAllCampaignInput) input: CreateYourMembershipAllCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('All Campaigns', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipAllCampaign_)
    async UpdateYourMembershipAllCampaign(
        @Arg('input', () => UpdateYourMembershipAllCampaignInput) input: UpdateYourMembershipAllCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('All Campaigns', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipAllCampaign_)
    async DeleteYourMembershipAllCampaign(@Arg('CampaignId', () => Int) CampaignId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CampaignId', Value: CampaignId}]);
        return this.DeleteRecord('All Campaigns', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Announcements
//****************************************************************************
@ObjectType({ description: `Admin announcements with title, text, publication dates, and active status` })
export class YourMembershipAnnouncement_ {
    @Field(() => Int) 
    AnnouncementId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Text?: string;
        
    @Field({nullable: true}) 
    StartDate?: Date;
        
    @Field({nullable: true}) 
    EndDate?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    Active?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Announcements
//****************************************************************************
@InputType()
export class CreateYourMembershipAnnouncementInput {
    @Field(() => Int, { nullable: true })
    AnnouncementId?: number;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Text: string | null;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    Active: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Announcements
//****************************************************************************
@InputType()
export class UpdateYourMembershipAnnouncementInput {
    @Field(() => Int)
    AnnouncementId: number;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Text?: string | null;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    Active?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Announcements
//****************************************************************************
@ObjectType()
export class RunYourMembershipAnnouncementViewResult {
    @Field(() => [YourMembershipAnnouncement_])
    Results: YourMembershipAnnouncement_[];

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

@Resolver(YourMembershipAnnouncement_)
export class YourMembershipAnnouncementResolver extends ResolverBase {
    @Query(() => RunYourMembershipAnnouncementViewResult)
    async RunYourMembershipAnnouncementViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipAnnouncementViewResult)
    async RunYourMembershipAnnouncementViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipAnnouncementViewResult)
    async RunYourMembershipAnnouncementDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Announcements';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipAnnouncement_, { nullable: true })
    async YourMembershipAnnouncement(@Arg('AnnouncementId', () => Int) AnnouncementId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipAnnouncement_ | null> {
        this.CheckUserReadPermissions('Announcements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwAnnouncements')} WHERE ${provider.QuoteIdentifier('AnnouncementId')}=${AnnouncementId} ` + this.getRowLevelSecurityWhereClause(provider, 'Announcements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Announcements', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipAnnouncement_)
    async CreateYourMembershipAnnouncement(
        @Arg('input', () => CreateYourMembershipAnnouncementInput) input: CreateYourMembershipAnnouncementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Announcements', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipAnnouncement_)
    async UpdateYourMembershipAnnouncement(
        @Arg('input', () => UpdateYourMembershipAnnouncementInput) input: UpdateYourMembershipAnnouncementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Announcements', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipAnnouncement_)
    async DeleteYourMembershipAnnouncement(@Arg('AnnouncementId', () => Int) AnnouncementId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'AnnouncementId', Value: AnnouncementId}]);
        return this.DeleteRecord('Announcements', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Calls
//****************************************************************************
@ObjectType({ description: `Logged phone calls with duration, direction, and recording details` })
export class HubSpotCall_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_call_title?: string;
        
    @Field({nullable: true}) 
    hs_call_body?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_call_status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_call_direction?: string;
        
    @Field(() => Int, {nullable: true}) 
    hs_call_duration?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_call_from_number?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_call_to_number?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_call_disposition?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    hs_call_recording_url?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({nullable: true}) 
    hs_timestamp?: Date;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotDealCall_])
    HubSpotDealCalls_call_idArray: HubSpotDealCall_[]; // Link to HubSpotDealCalls
    
    @Field(() => [HubSpotCompanyCall_])
    HubSpotCompanyCalls_call_idArray: HubSpotCompanyCall_[]; // Link to HubSpotCompanyCalls
    
    @Field(() => [HubSpotContactCall_])
    HubSpotContactCalls_call_idArray: HubSpotContactCall_[]; // Link to HubSpotContactCalls
    
    @Field(() => [HubSpotTicketCall_])
    HubSpotTicketCalls_call_idArray: HubSpotTicketCall_[]; // Link to HubSpotTicketCalls
    
}

//****************************************************************************
// INPUT TYPE for Calls
//****************************************************************************
@InputType()
export class CreateHubSpotCallInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_call_title: string | null;

    @Field({ nullable: true })
    hs_call_body: string | null;

    @Field({ nullable: true })
    hs_call_status: string | null;

    @Field({ nullable: true })
    hs_call_direction: string | null;

    @Field(() => Int, { nullable: true })
    hs_call_duration: number | null;

    @Field({ nullable: true })
    hs_call_from_number: string | null;

    @Field({ nullable: true })
    hs_call_to_number: string | null;

    @Field({ nullable: true })
    hs_call_disposition: string | null;

    @Field({ nullable: true })
    hs_call_recording_url: string | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    hs_timestamp: Date | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Calls
//****************************************************************************
@InputType()
export class UpdateHubSpotCallInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_call_title?: string | null;

    @Field({ nullable: true })
    hs_call_body?: string | null;

    @Field({ nullable: true })
    hs_call_status?: string | null;

    @Field({ nullable: true })
    hs_call_direction?: string | null;

    @Field(() => Int, { nullable: true })
    hs_call_duration?: number | null;

    @Field({ nullable: true })
    hs_call_from_number?: string | null;

    @Field({ nullable: true })
    hs_call_to_number?: string | null;

    @Field({ nullable: true })
    hs_call_disposition?: string | null;

    @Field({ nullable: true })
    hs_call_recording_url?: string | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    hs_timestamp?: Date | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Calls
//****************************************************************************
@ObjectType()
export class RunHubSpotCallViewResult {
    @Field(() => [HubSpotCall_])
    Results: HubSpotCall_[];

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

@Resolver(HubSpotCall_)
export class HubSpotCallResolver extends ResolverBase {
    @Query(() => RunHubSpotCallViewResult)
    async RunHubSpotCallViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCallViewResult)
    async RunHubSpotCallViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCallViewResult)
    async RunHubSpotCallDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Calls';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCall_, { nullable: true })
    async HubSpotCall(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCall_ | null> {
        this.CheckUserReadPermissions('Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCalls')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Calls', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotDealCall_])
    async HubSpotDealCalls_call_idArray(@Root() hubspotcall_: HubSpotCall_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealCalls')} WHERE ${provider.QuoteIdentifier('call_id')}='${hubspotcall_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyCall_])
    async HubSpotCompanyCalls_call_idArray(@Root() hubspotcall_: HubSpotCall_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyCalls')} WHERE ${provider.QuoteIdentifier('call_id')}='${hubspotcall_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactCall_])
    async HubSpotContactCalls_call_idArray(@Root() hubspotcall_: HubSpotCall_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactCalls')} WHERE ${provider.QuoteIdentifier('call_id')}='${hubspotcall_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketCall_])
    async HubSpotTicketCalls_call_idArray(@Root() hubspotcall_: HubSpotCall_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketCalls')} WHERE ${provider.QuoteIdentifier('call_id')}='${hubspotcall_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotCall_)
    async CreateHubSpotCall(
        @Arg('input', () => CreateHubSpotCallInput) input: CreateHubSpotCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Calls', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCall_)
    async UpdateHubSpotCall(
        @Arg('input', () => UpdateHubSpotCallInput) input: UpdateHubSpotCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Calls', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCall_)
    async DeleteHubSpotCall(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Calls', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Campaign Email Lists
//****************************************************************************
@ObjectType({ description: `Email distribution lists for campaigns with totals, bounces, and opt-out metrics` })
export class YourMembershipCampaignEmailList_ {
    @Field(() => Int) 
    ListId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ListType?: string;
        
    @Field(() => Int, {nullable: true}) 
    ListSize?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ListName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ListArea?: string;
        
    @Field({nullable: true}) 
    DateCreated?: Date;
        
    @Field({nullable: true}) 
    DateModified?: Date;
        
    @Field({nullable: true}) 
    DateLastUpdated?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Campaign Email Lists
//****************************************************************************
@InputType()
export class CreateYourMembershipCampaignEmailListInput {
    @Field(() => Int, { nullable: true })
    ListId?: number;

    @Field({ nullable: true })
    ListType: string | null;

    @Field(() => Int, { nullable: true })
    ListSize: number | null;

    @Field({ nullable: true })
    ListName: string | null;

    @Field({ nullable: true })
    ListArea: string | null;

    @Field({ nullable: true })
    DateCreated: Date | null;

    @Field({ nullable: true })
    DateModified: Date | null;

    @Field({ nullable: true })
    DateLastUpdated: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Campaign Email Lists
//****************************************************************************
@InputType()
export class UpdateYourMembershipCampaignEmailListInput {
    @Field(() => Int)
    ListId: number;

    @Field({ nullable: true })
    ListType?: string | null;

    @Field(() => Int, { nullable: true })
    ListSize?: number | null;

    @Field({ nullable: true })
    ListName?: string | null;

    @Field({ nullable: true })
    ListArea?: string | null;

    @Field({ nullable: true })
    DateCreated?: Date | null;

    @Field({ nullable: true })
    DateModified?: Date | null;

    @Field({ nullable: true })
    DateLastUpdated?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Campaign Email Lists
//****************************************************************************
@ObjectType()
export class RunYourMembershipCampaignEmailListViewResult {
    @Field(() => [YourMembershipCampaignEmailList_])
    Results: YourMembershipCampaignEmailList_[];

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

@Resolver(YourMembershipCampaignEmailList_)
export class YourMembershipCampaignEmailListResolver extends ResolverBase {
    @Query(() => RunYourMembershipCampaignEmailListViewResult)
    async RunYourMembershipCampaignEmailListViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCampaignEmailListViewResult)
    async RunYourMembershipCampaignEmailListViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCampaignEmailListViewResult)
    async RunYourMembershipCampaignEmailListDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Campaign Email Lists';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCampaignEmailList_, { nullable: true })
    async YourMembershipCampaignEmailList(@Arg('ListId', () => Int) ListId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCampaignEmailList_ | null> {
        this.CheckUserReadPermissions('Campaign Email Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCampaignEmailLists')} WHERE ${provider.QuoteIdentifier('ListId')}=${ListId} ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Email Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaign Email Lists', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipCampaignEmailList_)
    async CreateYourMembershipCampaignEmailList(
        @Arg('input', () => CreateYourMembershipCampaignEmailListInput) input: CreateYourMembershipCampaignEmailListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Campaign Email Lists', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCampaignEmailList_)
    async UpdateYourMembershipCampaignEmailList(
        @Arg('input', () => UpdateYourMembershipCampaignEmailListInput) input: UpdateYourMembershipCampaignEmailListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Campaign Email Lists', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCampaignEmailList_)
    async DeleteYourMembershipCampaignEmailList(@Arg('ListId', () => Int) ListId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ListId', Value: ListId}]);
        return this.DeleteRecord('Campaign Email Lists', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Campaigns
//****************************************************************************
@ObjectType({ description: `Email marketing campaigns with scheduling, sender, and delivery status` })
export class YourMembershipCampaign_ {
    @Field(() => Int) 
    CampaignId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CampaignName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Subject?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    SenderEmail?: string;
        
    @Field({nullable: true}) 
    DateScheduled?: Date;
        
    @Field({nullable: true}) 
    DateSent?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Campaigns
//****************************************************************************
@InputType()
export class CreateYourMembershipCampaignInput {
    @Field(() => Int, { nullable: true })
    CampaignId?: number;

    @Field({ nullable: true })
    CampaignName: string | null;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    SenderEmail: string | null;

    @Field({ nullable: true })
    DateScheduled: Date | null;

    @Field({ nullable: true })
    DateSent: Date | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Campaigns
//****************************************************************************
@InputType()
export class UpdateYourMembershipCampaignInput {
    @Field(() => Int)
    CampaignId: number;

    @Field({ nullable: true })
    CampaignName?: string | null;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    SenderEmail?: string | null;

    @Field({ nullable: true })
    DateScheduled?: Date | null;

    @Field({ nullable: true })
    DateSent?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Campaigns
//****************************************************************************
@ObjectType()
export class RunYourMembershipCampaignViewResult {
    @Field(() => [YourMembershipCampaign_])
    Results: YourMembershipCampaign_[];

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

@Resolver(YourMembershipCampaign_)
export class YourMembershipCampaignResolver extends ResolverBase {
    @Query(() => RunYourMembershipCampaignViewResult)
    async RunYourMembershipCampaignViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCampaignViewResult)
    async RunYourMembershipCampaignViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCampaignViewResult)
    async RunYourMembershipCampaignDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Campaigns';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCampaign_, { nullable: true })
    async YourMembershipCampaign(@Arg('CampaignId', () => Int) CampaignId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCampaign_ | null> {
        this.CheckUserReadPermissions('Campaigns', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCampaigns')} WHERE ${provider.QuoteIdentifier('CampaignId')}=${CampaignId} ` + this.getRowLevelSecurityWhereClause(provider, 'Campaigns', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaigns', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipCampaign_)
    async CreateYourMembershipCampaign(
        @Arg('input', () => CreateYourMembershipCampaignInput) input: CreateYourMembershipCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Campaigns', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCampaign_)
    async UpdateYourMembershipCampaign(
        @Arg('input', () => UpdateYourMembershipCampaignInput) input: UpdateYourMembershipCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Campaigns', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCampaign_)
    async DeleteYourMembershipCampaign(@Arg('CampaignId', () => Int) CampaignId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CampaignId', Value: CampaignId}]);
        return this.DeleteRecord('Campaigns', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Career Openings
//****************************************************************************
@ObjectType({ description: `Job board postings with position, organization, salary, and contact details` })
export class YourMembershipCareerOpening_ {
    @Field(() => Int) 
    CareerOpeningID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Position?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Salary?: string;
        
    @Field({nullable: true}) 
    DatePosted?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ContactEmail?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Career Openings
//****************************************************************************
@InputType()
export class CreateYourMembershipCareerOpeningInput {
    @Field(() => Int, { nullable: true })
    CareerOpeningID?: number;

    @Field({ nullable: true })
    Position: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Salary: string | null;

    @Field({ nullable: true })
    DatePosted: Date | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ContactEmail: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Career Openings
//****************************************************************************
@InputType()
export class UpdateYourMembershipCareerOpeningInput {
    @Field(() => Int)
    CareerOpeningID: number;

    @Field({ nullable: true })
    Position?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Salary?: string | null;

    @Field({ nullable: true })
    DatePosted?: Date | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ContactEmail?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Career Openings
//****************************************************************************
@ObjectType()
export class RunYourMembershipCareerOpeningViewResult {
    @Field(() => [YourMembershipCareerOpening_])
    Results: YourMembershipCareerOpening_[];

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

@Resolver(YourMembershipCareerOpening_)
export class YourMembershipCareerOpeningResolver extends ResolverBase {
    @Query(() => RunYourMembershipCareerOpeningViewResult)
    async RunYourMembershipCareerOpeningViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCareerOpeningViewResult)
    async RunYourMembershipCareerOpeningViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCareerOpeningViewResult)
    async RunYourMembershipCareerOpeningDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Career Openings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCareerOpening_, { nullable: true })
    async YourMembershipCareerOpening(@Arg('CareerOpeningID', () => Int) CareerOpeningID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCareerOpening_ | null> {
        this.CheckUserReadPermissions('Career Openings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCareerOpenings')} WHERE ${provider.QuoteIdentifier('CareerOpeningID')}=${CareerOpeningID} ` + this.getRowLevelSecurityWhereClause(provider, 'Career Openings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Career Openings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipCareerOpening_)
    async CreateYourMembershipCareerOpening(
        @Arg('input', () => CreateYourMembershipCareerOpeningInput) input: CreateYourMembershipCareerOpeningInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Career Openings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCareerOpening_)
    async UpdateYourMembershipCareerOpening(
        @Arg('input', () => UpdateYourMembershipCareerOpeningInput) input: UpdateYourMembershipCareerOpeningInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Career Openings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCareerOpening_)
    async DeleteYourMembershipCareerOpening(@Arg('CareerOpeningID', () => Int) CareerOpeningID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CareerOpeningID', Value: CareerOpeningID}]);
        return this.DeleteRecord('Career Openings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certification Credit Types
//****************************************************************************
@ObjectType({ description: `Types of continuing education credits (e.g., CEU, CPE) with expiration rules` })
export class YourMembershipCertificationCreditType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDefault?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    CreditsExpire?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipEventCEUAward_])
    YourMembershipEventCEUAwards_CreditTypeIDArray: YourMembershipEventCEUAward_[]; // Link to YourMembershipEventCEUAwards
    
}

//****************************************************************************
// INPUT TYPE for Certification Credit Types
//****************************************************************************
@InputType()
export class CreateYourMembershipCertificationCreditTypeInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    Code: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault: boolean | null;

    @Field(() => Boolean, { nullable: true })
    CreditsExpire: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Certification Credit Types
//****************************************************************************
@InputType()
export class UpdateYourMembershipCertificationCreditTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Code?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    CreditsExpire?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certification Credit Types
//****************************************************************************
@ObjectType()
export class RunYourMembershipCertificationCreditTypeViewResult {
    @Field(() => [YourMembershipCertificationCreditType_])
    Results: YourMembershipCertificationCreditType_[];

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

@Resolver(YourMembershipCertificationCreditType_)
export class YourMembershipCertificationCreditTypeResolver extends ResolverBase {
    @Query(() => RunYourMembershipCertificationCreditTypeViewResult)
    async RunYourMembershipCertificationCreditTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCertificationCreditTypeViewResult)
    async RunYourMembershipCertificationCreditTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCertificationCreditTypeViewResult)
    async RunYourMembershipCertificationCreditTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certification Credit Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCertificationCreditType_, { nullable: true })
    async YourMembershipCertificationCreditType(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCertificationCreditType_ | null> {
        this.CheckUserReadPermissions('Certification Credit Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCertificationCreditTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Credit Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Credit Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipEventCEUAward_])
    async YourMembershipEventCEUAwards_CreditTypeIDArray(@Root() yourmembershipcertificationcredittype_: YourMembershipCertificationCreditType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event CEU Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventCEUAwards')} WHERE ${provider.QuoteIdentifier('CreditTypeID')}=${yourmembershipcertificationcredittype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Event CEU Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event CEU Awards', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipCertificationCreditType_)
    async CreateYourMembershipCertificationCreditType(
        @Arg('input', () => CreateYourMembershipCertificationCreditTypeInput) input: CreateYourMembershipCertificationCreditTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certification Credit Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCertificationCreditType_)
    async UpdateYourMembershipCertificationCreditType(
        @Arg('input', () => UpdateYourMembershipCertificationCreditTypeInput) input: UpdateYourMembershipCertificationCreditTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certification Credit Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCertificationCreditType_)
    async DeleteYourMembershipCertificationCreditType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Certification Credit Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certification Journals
//****************************************************************************
@ObjectType({ description: `Continuing education journal entries tracking CEU credits earned by members` })
export class YourMembershipCertificationJournal_ {
    @Field(() => Int) 
    EntryID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CertificationName?: string;
        
    @Field(() => Float, {nullable: true}) 
    CEUsEarned?: number;
        
    @Field({nullable: true}) 
    EntryDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field(() => Int, {nullable: true}) 
    WebsiteMemberID?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Certification Journals
//****************************************************************************
@InputType()
export class CreateYourMembershipCertificationJournalInput {
    @Field(() => Int, { nullable: true })
    EntryID?: number;

    @Field({ nullable: true })
    CertificationName: string | null;

    @Field(() => Float, { nullable: true })
    CEUsEarned: number | null;

    @Field({ nullable: true })
    EntryDate: Date | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Certification Journals
//****************************************************************************
@InputType()
export class UpdateYourMembershipCertificationJournalInput {
    @Field(() => Int)
    EntryID: number;

    @Field({ nullable: true })
    CertificationName?: string | null;

    @Field(() => Float, { nullable: true })
    CEUsEarned?: number | null;

    @Field({ nullable: true })
    EntryDate?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certification Journals
//****************************************************************************
@ObjectType()
export class RunYourMembershipCertificationJournalViewResult {
    @Field(() => [YourMembershipCertificationJournal_])
    Results: YourMembershipCertificationJournal_[];

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

@Resolver(YourMembershipCertificationJournal_)
export class YourMembershipCertificationJournalResolver extends ResolverBase {
    @Query(() => RunYourMembershipCertificationJournalViewResult)
    async RunYourMembershipCertificationJournalViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCertificationJournalViewResult)
    async RunYourMembershipCertificationJournalViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCertificationJournalViewResult)
    async RunYourMembershipCertificationJournalDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certification Journals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCertificationJournal_, { nullable: true })
    async YourMembershipCertificationJournal(@Arg('EntryID', () => Int) EntryID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCertificationJournal_ | null> {
        this.CheckUserReadPermissions('Certification Journals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCertificationJournals')} WHERE ${provider.QuoteIdentifier('EntryID')}=${EntryID} ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Journals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Journals', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipCertificationJournal_)
    async CreateYourMembershipCertificationJournal(
        @Arg('input', () => CreateYourMembershipCertificationJournalInput) input: CreateYourMembershipCertificationJournalInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certification Journals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCertificationJournal_)
    async UpdateYourMembershipCertificationJournal(
        @Arg('input', () => UpdateYourMembershipCertificationJournalInput) input: UpdateYourMembershipCertificationJournalInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certification Journals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCertificationJournal_)
    async DeleteYourMembershipCertificationJournal(@Arg('EntryID', () => Int) EntryID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'EntryID', Value: EntryID}]);
        return this.DeleteRecord('Certification Journals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certifications
//****************************************************************************
@ObjectType({ description: `Professional certifications and continuing education programs` })
export class YourMembershipCertification_ {
    @Field() 
    @MaxLength(200)
    CertificationID: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    CEUsRequired?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Code?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipEventCEUAward_])
    YourMembershipEventCEUAwards_CertificationIDArray: YourMembershipEventCEUAward_[]; // Link to YourMembershipEventCEUAwards
    
}

//****************************************************************************
// INPUT TYPE for Certifications
//****************************************************************************
@InputType()
export class CreateYourMembershipCertificationInput {
    @Field({ nullable: true })
    CertificationID?: string;

    @Field({ nullable: true })
    ID: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive: boolean | null;

    @Field(() => Int, { nullable: true })
    CEUsRequired: number | null;

    @Field({ nullable: true })
    Code: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Certifications
//****************************************************************************
@InputType()
export class UpdateYourMembershipCertificationInput {
    @Field()
    CertificationID: string;

    @Field({ nullable: true })
    ID?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Int, { nullable: true })
    CEUsRequired?: number | null;

    @Field({ nullable: true })
    Code?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certifications
//****************************************************************************
@ObjectType()
export class RunYourMembershipCertificationViewResult {
    @Field(() => [YourMembershipCertification_])
    Results: YourMembershipCertification_[];

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

@Resolver(YourMembershipCertification_)
export class YourMembershipCertificationResolver extends ResolverBase {
    @Query(() => RunYourMembershipCertificationViewResult)
    async RunYourMembershipCertificationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCertificationViewResult)
    async RunYourMembershipCertificationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCertificationViewResult)
    async RunYourMembershipCertificationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certifications';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCertification_, { nullable: true })
    async YourMembershipCertification(@Arg('CertificationID', () => String) CertificationID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCertification_ | null> {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCertifications')} WHERE ${provider.QuoteIdentifier('CertificationID')}='${CertificationID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certifications', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipEventCEUAward_])
    async YourMembershipEventCEUAwards_CertificationIDArray(@Root() yourmembershipcertification_: YourMembershipCertification_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event CEU Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventCEUAwards')} WHERE ${provider.QuoteIdentifier('CertificationID')}='${yourmembershipcertification_.CertificationID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event CEU Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event CEU Awards', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipCertification_)
    async CreateYourMembershipCertification(
        @Arg('input', () => CreateYourMembershipCertificationInput) input: CreateYourMembershipCertificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certifications', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCertification_)
    async UpdateYourMembershipCertification(
        @Arg('input', () => UpdateYourMembershipCertificationInput) input: UpdateYourMembershipCertificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certifications', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCertification_)
    async DeleteYourMembershipCertification(@Arg('CertificationID', () => String) CertificationID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CertificationID', Value: CertificationID}]);
        return this.DeleteRecord('Certifications', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Companies
//****************************************************************************
@ObjectType({ description: `CRM companies with organization details and firmographic data` })
export class HubSpotCompany_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    domain?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    address2?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    city?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    state?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    zip?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    website?: string;
        
    @Field({nullable: true}) 
    description?: string;
        
    @Field(() => Int, {nullable: true}) 
    numberofemployees?: number;
        
    @Field(() => Float, {nullable: true}) 
    annualrevenue?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    lifecyclestage?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    type?: string;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    founded_year?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    is_public?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotContact_])
    HubSpotContacts_associatedcompanyidArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotCompanyDeal_])
    HubSpotCompanyDeals_company_idArray: HubSpotCompanyDeal_[]; // Link to HubSpotCompanyDeals
    
    @Field(() => [HubSpotCompanyTask_])
    HubSpotCompanyTasks_company_idArray: HubSpotCompanyTask_[]; // Link to HubSpotCompanyTasks
    
    @Field(() => [HubSpotCompanyNote_])
    HubSpotCompanyNotes_company_idArray: HubSpotCompanyNote_[]; // Link to HubSpotCompanyNotes
    
    @Field(() => [HubSpotCompanyCall_])
    HubSpotCompanyCalls_company_idArray: HubSpotCompanyCall_[]; // Link to HubSpotCompanyCalls
    
    @Field(() => [HubSpotCompanyTicket_])
    HubSpotCompanyTickets_company_idArray: HubSpotCompanyTicket_[]; // Link to HubSpotCompanyTickets
    
    @Field(() => [HubSpotCompanyEmail_])
    HubSpotCompanyEmails_company_idArray: HubSpotCompanyEmail_[]; // Link to HubSpotCompanyEmails
    
    @Field(() => [HubSpotCompanyMeeting_])
    HubSpotCompanyMeetings_company_idArray: HubSpotCompanyMeeting_[]; // Link to HubSpotCompanyMeetings
    
    @Field(() => [HubSpotContactCompany_])
    HubSpotContactCompanies_company_idArray: HubSpotContactCompany_[]; // Link to HubSpotContactCompanies
    
}

//****************************************************************************
// INPUT TYPE for Companies
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    name: string | null;

    @Field({ nullable: true })
    domain: string | null;

    @Field({ nullable: true })
    industry: string | null;

    @Field({ nullable: true })
    phone: string | null;

    @Field({ nullable: true })
    address: string | null;

    @Field({ nullable: true })
    address2: string | null;

    @Field({ nullable: true })
    city: string | null;

    @Field({ nullable: true })
    state: string | null;

    @Field({ nullable: true })
    zip: string | null;

    @Field({ nullable: true })
    country: string | null;

    @Field({ nullable: true })
    website: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field(() => Int, { nullable: true })
    numberofemployees: number | null;

    @Field(() => Float, { nullable: true })
    annualrevenue: number | null;

    @Field({ nullable: true })
    lifecyclestage: string | null;

    @Field({ nullable: true })
    type: string | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    founded_year: string | null;

    @Field(() => Boolean, { nullable: true })
    is_public: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Companies
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    name?: string | null;

    @Field({ nullable: true })
    domain?: string | null;

    @Field({ nullable: true })
    industry?: string | null;

    @Field({ nullable: true })
    phone?: string | null;

    @Field({ nullable: true })
    address?: string | null;

    @Field({ nullable: true })
    address2?: string | null;

    @Field({ nullable: true })
    city?: string | null;

    @Field({ nullable: true })
    state?: string | null;

    @Field({ nullable: true })
    zip?: string | null;

    @Field({ nullable: true })
    country?: string | null;

    @Field({ nullable: true })
    website?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field(() => Int, { nullable: true })
    numberofemployees?: number | null;

    @Field(() => Float, { nullable: true })
    annualrevenue?: number | null;

    @Field({ nullable: true })
    lifecyclestage?: string | null;

    @Field({ nullable: true })
    type?: string | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    founded_year?: string | null;

    @Field(() => Boolean, { nullable: true })
    is_public?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Companies
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyViewResult {
    @Field(() => [HubSpotCompany_])
    Results: HubSpotCompany_[];

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

@Resolver(HubSpotCompany_)
export class HubSpotCompanyResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyViewResult)
    async RunHubSpotCompanyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyViewResult)
    async RunHubSpotCompanyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyViewResult)
    async RunHubSpotCompanyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Companies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompany_, { nullable: true })
    async HubSpotCompany(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompany_ | null> {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Companies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_associatedcompanyidArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('associatedcompanyid')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyDeal_])
    async HubSpotCompanyDeals_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyDeals')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Deals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyTask_])
    async HubSpotCompanyTasks_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyTasks')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyNote_])
    async HubSpotCompanyNotes_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyNotes')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyCall_])
    async HubSpotCompanyCalls_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyCalls')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyTicket_])
    async HubSpotCompanyTickets_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyTickets')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyEmail_])
    async HubSpotCompanyEmails_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyEmails')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyMeeting_])
    async HubSpotCompanyMeetings_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyMeetings')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactCompany_])
    async HubSpotContactCompanies_company_idArray(@Root() hubspotcompany_: HubSpotCompany_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactCompanies')} WHERE ${provider.QuoteIdentifier('company_id')}='${hubspotcompany_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotCompany_)
    async CreateHubSpotCompany(
        @Arg('input', () => CreateHubSpotCompanyInput) input: CreateHubSpotCompanyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Companies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompany_)
    async UpdateHubSpotCompany(
        @Arg('input', () => UpdateHubSpotCompanyInput) input: UpdateHubSpotCompanyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Companies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompany_)
    async DeleteHubSpotCompany(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Companies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Calls
//****************************************************************************
@ObjectType({ description: `Associations between companies and logged calls` })
export class HubSpotCompanyCall_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Call hs_object_id`}) 
    @MaxLength(100)
    call_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Calls
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyCallInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    call_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Calls
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyCallInput {
    @Field()
    company_id: string;

    @Field()
    call_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Calls
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyCallViewResult {
    @Field(() => [HubSpotCompanyCall_])
    Results: HubSpotCompanyCall_[];

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

@Resolver(HubSpotCompanyCall_)
export class HubSpotCompanyCallResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyCallViewResult)
    async RunHubSpotCompanyCallViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyCallViewResult)
    async RunHubSpotCompanyCallViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyCallViewResult)
    async RunHubSpotCompanyCallDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Calls';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyCall_, { nullable: true })
    async HubSpotCompanyCall(@Arg('company_id', () => String) company_id: string, @Arg('call_id', () => String) call_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyCall_ | null> {
        this.CheckUserReadPermissions('Company Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyCalls')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('call_id')}='${call_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Calls', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyCall_)
    async CreateHubSpotCompanyCall(
        @Arg('input', () => CreateHubSpotCompanyCallInput) input: CreateHubSpotCompanyCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Calls', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyCall_)
    async UpdateHubSpotCompanyCall(
        @Arg('input', () => UpdateHubSpotCompanyCallInput) input: UpdateHubSpotCompanyCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Calls', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyCall_)
    async DeleteHubSpotCompanyCall(@Arg('company_id', () => String) company_id: string, @Arg('call_id', () => String) call_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'call_id', Value: call_id}]);
        return this.DeleteRecord('Company Calls', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Deals
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between companies and deals` })
export class HubSpotCompanyDeal_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Deals
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyDealInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Deals
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyDealInput {
    @Field()
    company_id: string;

    @Field()
    deal_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Deals
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyDealViewResult {
    @Field(() => [HubSpotCompanyDeal_])
    Results: HubSpotCompanyDeal_[];

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

@Resolver(HubSpotCompanyDeal_)
export class HubSpotCompanyDealResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyDealViewResult)
    async RunHubSpotCompanyDealViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyDealViewResult)
    async RunHubSpotCompanyDealViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyDealViewResult)
    async RunHubSpotCompanyDealDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Deals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyDeal_, { nullable: true })
    async HubSpotCompanyDeal(@Arg('company_id', () => String) company_id: string, @Arg('deal_id', () => String) deal_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyDeal_ | null> {
        this.CheckUserReadPermissions('Company Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyDeals')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('deal_id')}='${deal_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Deals', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyDeal_)
    async CreateHubSpotCompanyDeal(
        @Arg('input', () => CreateHubSpotCompanyDealInput) input: CreateHubSpotCompanyDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Deals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyDeal_)
    async UpdateHubSpotCompanyDeal(
        @Arg('input', () => UpdateHubSpotCompanyDealInput) input: UpdateHubSpotCompanyDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Deals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyDeal_)
    async DeleteHubSpotCompanyDeal(@Arg('company_id', () => String) company_id: string, @Arg('deal_id', () => String) deal_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'deal_id', Value: deal_id}]);
        return this.DeleteRecord('Company Deals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Emails
//****************************************************************************
@ObjectType({ description: `Associations between companies and logged emails` })
export class HubSpotCompanyEmail_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Email hs_object_id`}) 
    @MaxLength(100)
    email_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Emails
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyEmailInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    email_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Emails
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyEmailInput {
    @Field()
    company_id: string;

    @Field()
    email_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Emails
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyEmailViewResult {
    @Field(() => [HubSpotCompanyEmail_])
    Results: HubSpotCompanyEmail_[];

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

@Resolver(HubSpotCompanyEmail_)
export class HubSpotCompanyEmailResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyEmailViewResult)
    async RunHubSpotCompanyEmailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyEmailViewResult)
    async RunHubSpotCompanyEmailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyEmailViewResult)
    async RunHubSpotCompanyEmailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyEmail_, { nullable: true })
    async HubSpotCompanyEmail(@Arg('company_id', () => String) company_id: string, @Arg('email_id', () => String) email_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyEmail_ | null> {
        this.CheckUserReadPermissions('Company Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyEmails')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('email_id')}='${email_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyEmail_)
    async CreateHubSpotCompanyEmail(
        @Arg('input', () => CreateHubSpotCompanyEmailInput) input: CreateHubSpotCompanyEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyEmail_)
    async UpdateHubSpotCompanyEmail(
        @Arg('input', () => UpdateHubSpotCompanyEmailInput) input: UpdateHubSpotCompanyEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyEmail_)
    async DeleteHubSpotCompanyEmail(@Arg('company_id', () => String) company_id: string, @Arg('email_id', () => String) email_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'email_id', Value: email_id}]);
        return this.DeleteRecord('Company Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Meetings
//****************************************************************************
@ObjectType({ description: `Associations between companies and meetings` })
export class HubSpotCompanyMeeting_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Meeting hs_object_id`}) 
    @MaxLength(100)
    meeting_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Meetings
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyMeetingInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    meeting_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Meetings
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyMeetingInput {
    @Field()
    company_id: string;

    @Field()
    meeting_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Meetings
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyMeetingViewResult {
    @Field(() => [HubSpotCompanyMeeting_])
    Results: HubSpotCompanyMeeting_[];

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

@Resolver(HubSpotCompanyMeeting_)
export class HubSpotCompanyMeetingResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyMeetingViewResult)
    async RunHubSpotCompanyMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyMeetingViewResult)
    async RunHubSpotCompanyMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyMeetingViewResult)
    async RunHubSpotCompanyMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyMeeting_, { nullable: true })
    async HubSpotCompanyMeeting(@Arg('company_id', () => String) company_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyMeeting_ | null> {
        this.CheckUserReadPermissions('Company Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyMeetings')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('meeting_id')}='${meeting_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Meetings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyMeeting_)
    async CreateHubSpotCompanyMeeting(
        @Arg('input', () => CreateHubSpotCompanyMeetingInput) input: CreateHubSpotCompanyMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyMeeting_)
    async UpdateHubSpotCompanyMeeting(
        @Arg('input', () => UpdateHubSpotCompanyMeetingInput) input: UpdateHubSpotCompanyMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyMeeting_)
    async DeleteHubSpotCompanyMeeting(@Arg('company_id', () => String) company_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'meeting_id', Value: meeting_id}]);
        return this.DeleteRecord('Company Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Notes
//****************************************************************************
@ObjectType({ description: `Associations between companies and notes` })
export class HubSpotCompanyNote_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Note hs_object_id`}) 
    @MaxLength(100)
    note_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Notes
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyNoteInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    note_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Notes
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyNoteInput {
    @Field()
    company_id: string;

    @Field()
    note_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Notes
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyNoteViewResult {
    @Field(() => [HubSpotCompanyNote_])
    Results: HubSpotCompanyNote_[];

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

@Resolver(HubSpotCompanyNote_)
export class HubSpotCompanyNoteResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyNoteViewResult)
    async RunHubSpotCompanyNoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyNoteViewResult)
    async RunHubSpotCompanyNoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyNoteViewResult)
    async RunHubSpotCompanyNoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Notes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyNote_, { nullable: true })
    async HubSpotCompanyNote(@Arg('company_id', () => String) company_id: string, @Arg('note_id', () => String) note_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyNote_ | null> {
        this.CheckUserReadPermissions('Company Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyNotes')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('note_id')}='${note_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Notes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyNote_)
    async CreateHubSpotCompanyNote(
        @Arg('input', () => CreateHubSpotCompanyNoteInput) input: CreateHubSpotCompanyNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Notes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyNote_)
    async UpdateHubSpotCompanyNote(
        @Arg('input', () => UpdateHubSpotCompanyNoteInput) input: UpdateHubSpotCompanyNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Notes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyNote_)
    async DeleteHubSpotCompanyNote(@Arg('company_id', () => String) company_id: string, @Arg('note_id', () => String) note_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'note_id', Value: note_id}]);
        return this.DeleteRecord('Company Notes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Tasks
//****************************************************************************
@ObjectType({ description: `Associations between companies and tasks` })
export class HubSpotCompanyTask_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Task hs_object_id`}) 
    @MaxLength(100)
    task_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Tasks
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyTaskInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    task_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Tasks
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyTaskInput {
    @Field()
    company_id: string;

    @Field()
    task_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Tasks
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyTaskViewResult {
    @Field(() => [HubSpotCompanyTask_])
    Results: HubSpotCompanyTask_[];

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

@Resolver(HubSpotCompanyTask_)
export class HubSpotCompanyTaskResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyTaskViewResult)
    async RunHubSpotCompanyTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyTaskViewResult)
    async RunHubSpotCompanyTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyTaskViewResult)
    async RunHubSpotCompanyTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyTask_, { nullable: true })
    async HubSpotCompanyTask(@Arg('company_id', () => String) company_id: string, @Arg('task_id', () => String) task_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyTask_ | null> {
        this.CheckUserReadPermissions('Company Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyTasks')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('task_id')}='${task_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Tasks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyTask_)
    async CreateHubSpotCompanyTask(
        @Arg('input', () => CreateHubSpotCompanyTaskInput) input: CreateHubSpotCompanyTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyTask_)
    async UpdateHubSpotCompanyTask(
        @Arg('input', () => UpdateHubSpotCompanyTaskInput) input: UpdateHubSpotCompanyTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyTask_)
    async DeleteHubSpotCompanyTask(@Arg('company_id', () => String) company_id: string, @Arg('task_id', () => String) task_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'task_id', Value: task_id}]);
        return this.DeleteRecord('Company Tasks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Tickets
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between companies and support tickets` })
export class HubSpotCompanyTicket_ {
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Company Tickets
//****************************************************************************
@InputType()
export class CreateHubSpotCompanyTicketInput {
    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Company Tickets
//****************************************************************************
@InputType()
export class UpdateHubSpotCompanyTicketInput {
    @Field()
    company_id: string;

    @Field()
    ticket_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Tickets
//****************************************************************************
@ObjectType()
export class RunHubSpotCompanyTicketViewResult {
    @Field(() => [HubSpotCompanyTicket_])
    Results: HubSpotCompanyTicket_[];

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

@Resolver(HubSpotCompanyTicket_)
export class HubSpotCompanyTicketResolver extends ResolverBase {
    @Query(() => RunHubSpotCompanyTicketViewResult)
    async RunHubSpotCompanyTicketViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyTicketViewResult)
    async RunHubSpotCompanyTicketViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotCompanyTicketViewResult)
    async RunHubSpotCompanyTicketDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Tickets';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotCompanyTicket_, { nullable: true })
    async HubSpotCompanyTicket(@Arg('company_id', () => String) company_id: string, @Arg('ticket_id', () => String) ticket_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotCompanyTicket_ | null> {
        this.CheckUserReadPermissions('Company Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyTickets')} WHERE ${provider.QuoteIdentifier('company_id')}='${company_id}' AND ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Tickets', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotCompanyTicket_)
    async CreateHubSpotCompanyTicket(
        @Arg('input', () => CreateHubSpotCompanyTicketInput) input: CreateHubSpotCompanyTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Tickets', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotCompanyTicket_)
    async UpdateHubSpotCompanyTicket(
        @Arg('input', () => UpdateHubSpotCompanyTicketInput) input: UpdateHubSpotCompanyTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Tickets', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotCompanyTicket_)
    async DeleteHubSpotCompanyTicket(@Arg('company_id', () => String) company_id: string, @Arg('ticket_id', () => String) ticket_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'company_id', Value: company_id}, {FieldName: 'ticket_id', Value: ticket_id}]);
        return this.DeleteRecord('Company Tickets', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Connections
//****************************************************************************
@ObjectType({ description: `Networking connections between members including contact info and connection status` })
export class YourMembershipConnection_ {
    @Field(() => Int) 
    ConnectionId: number;
        
    @Field(() => Int, {nullable: true}) 
    ProfileID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    WorkTitle?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Connections
//****************************************************************************
@InputType()
export class CreateYourMembershipConnectionInput {
    @Field(() => Int, { nullable: true })
    ConnectionId?: number;

    @Field(() => Int, { nullable: true })
    ProfileID: number | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    WorkTitle: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Connections
//****************************************************************************
@InputType()
export class UpdateYourMembershipConnectionInput {
    @Field(() => Int)
    ConnectionId: number;

    @Field(() => Int, { nullable: true })
    ProfileID?: number | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    WorkTitle?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Connections
//****************************************************************************
@ObjectType()
export class RunYourMembershipConnectionViewResult {
    @Field(() => [YourMembershipConnection_])
    Results: YourMembershipConnection_[];

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

@Resolver(YourMembershipConnection_)
export class YourMembershipConnectionResolver extends ResolverBase {
    @Query(() => RunYourMembershipConnectionViewResult)
    async RunYourMembershipConnectionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipConnectionViewResult)
    async RunYourMembershipConnectionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipConnectionViewResult)
    async RunYourMembershipConnectionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Connections';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipConnection_, { nullable: true })
    async YourMembershipConnection(@Arg('ConnectionId', () => Int) ConnectionId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipConnection_ | null> {
        this.CheckUserReadPermissions('Connections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwConnections')} WHERE ${provider.QuoteIdentifier('ConnectionId')}=${ConnectionId} ` + this.getRowLevelSecurityWhereClause(provider, 'Connections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Connections', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipConnection_)
    async CreateYourMembershipConnection(
        @Arg('input', () => CreateYourMembershipConnectionInput) input: CreateYourMembershipConnectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Connections', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipConnection_)
    async UpdateYourMembershipConnection(
        @Arg('input', () => UpdateYourMembershipConnectionInput) input: UpdateYourMembershipConnectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Connections', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipConnection_)
    async DeleteYourMembershipConnection(@Arg('ConnectionId', () => Int) ConnectionId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ConnectionId', Value: ConnectionId}]);
        return this.DeleteRecord('Connections', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Calls
//****************************************************************************
@ObjectType({ description: `Associations between contacts and logged calls` })
export class HubSpotContactCall_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Call hs_object_id`}) 
    @MaxLength(100)
    call_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Calls
//****************************************************************************
@InputType()
export class CreateHubSpotContactCallInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    call_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Calls
//****************************************************************************
@InputType()
export class UpdateHubSpotContactCallInput {
    @Field()
    contact_id: string;

    @Field()
    call_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Calls
//****************************************************************************
@ObjectType()
export class RunHubSpotContactCallViewResult {
    @Field(() => [HubSpotContactCall_])
    Results: HubSpotContactCall_[];

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

@Resolver(HubSpotContactCall_)
export class HubSpotContactCallResolver extends ResolverBase {
    @Query(() => RunHubSpotContactCallViewResult)
    async RunHubSpotContactCallViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactCallViewResult)
    async RunHubSpotContactCallViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactCallViewResult)
    async RunHubSpotContactCallDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Calls';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactCall_, { nullable: true })
    async HubSpotContactCall(@Arg('contact_id', () => String) contact_id: string, @Arg('call_id', () => String) call_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactCall_ | null> {
        this.CheckUserReadPermissions('Contact Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactCalls')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('call_id')}='${call_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Calls', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactCall_)
    async CreateHubSpotContactCall(
        @Arg('input', () => CreateHubSpotContactCallInput) input: CreateHubSpotContactCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Calls', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactCall_)
    async UpdateHubSpotContactCall(
        @Arg('input', () => UpdateHubSpotContactCallInput) input: UpdateHubSpotContactCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Calls', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactCall_)
    async DeleteHubSpotContactCall(@Arg('contact_id', () => String) contact_id: string, @Arg('call_id', () => String) call_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'call_id', Value: call_id}]);
        return this.DeleteRecord('Contact Calls', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Companies
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between contacts and companies` })
export class HubSpotContactCompany_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Company hs_object_id`}) 
    @MaxLength(100)
    company_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Companies
//****************************************************************************
@InputType()
export class CreateHubSpotContactCompanyInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    company_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Companies
//****************************************************************************
@InputType()
export class UpdateHubSpotContactCompanyInput {
    @Field()
    contact_id: string;

    @Field()
    company_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Companies
//****************************************************************************
@ObjectType()
export class RunHubSpotContactCompanyViewResult {
    @Field(() => [HubSpotContactCompany_])
    Results: HubSpotContactCompany_[];

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

@Resolver(HubSpotContactCompany_)
export class HubSpotContactCompanyResolver extends ResolverBase {
    @Query(() => RunHubSpotContactCompanyViewResult)
    async RunHubSpotContactCompanyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactCompanyViewResult)
    async RunHubSpotContactCompanyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactCompanyViewResult)
    async RunHubSpotContactCompanyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Companies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactCompany_, { nullable: true })
    async HubSpotContactCompany(@Arg('contact_id', () => String) contact_id: string, @Arg('company_id', () => String) company_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactCompany_ | null> {
        this.CheckUserReadPermissions('Contact Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactCompanies')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('company_id')}='${company_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Companies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactCompany_)
    async CreateHubSpotContactCompany(
        @Arg('input', () => CreateHubSpotContactCompanyInput) input: CreateHubSpotContactCompanyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Companies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactCompany_)
    async UpdateHubSpotContactCompany(
        @Arg('input', () => UpdateHubSpotContactCompanyInput) input: UpdateHubSpotContactCompanyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Companies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactCompany_)
    async DeleteHubSpotContactCompany(@Arg('contact_id', () => String) contact_id: string, @Arg('company_id', () => String) company_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'company_id', Value: company_id}]);
        return this.DeleteRecord('Contact Companies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Deals
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between contacts and deals` })
export class HubSpotContactDeal_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Deals
//****************************************************************************
@InputType()
export class CreateHubSpotContactDealInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Deals
//****************************************************************************
@InputType()
export class UpdateHubSpotContactDealInput {
    @Field()
    contact_id: string;

    @Field()
    deal_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Deals
//****************************************************************************
@ObjectType()
export class RunHubSpotContactDealViewResult {
    @Field(() => [HubSpotContactDeal_])
    Results: HubSpotContactDeal_[];

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

@Resolver(HubSpotContactDeal_)
export class HubSpotContactDealResolver extends ResolverBase {
    @Query(() => RunHubSpotContactDealViewResult)
    async RunHubSpotContactDealViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactDealViewResult)
    async RunHubSpotContactDealViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactDealViewResult)
    async RunHubSpotContactDealDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Deals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactDeal_, { nullable: true })
    async HubSpotContactDeal(@Arg('contact_id', () => String) contact_id: string, @Arg('deal_id', () => String) deal_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactDeal_ | null> {
        this.CheckUserReadPermissions('Contact Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactDeals')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('deal_id')}='${deal_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Deals', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactDeal_)
    async CreateHubSpotContactDeal(
        @Arg('input', () => CreateHubSpotContactDealInput) input: CreateHubSpotContactDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Deals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactDeal_)
    async UpdateHubSpotContactDeal(
        @Arg('input', () => UpdateHubSpotContactDealInput) input: UpdateHubSpotContactDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Deals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactDeal_)
    async DeleteHubSpotContactDeal(@Arg('contact_id', () => String) contact_id: string, @Arg('deal_id', () => String) deal_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'deal_id', Value: deal_id}]);
        return this.DeleteRecord('Contact Deals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Emails
//****************************************************************************
@ObjectType({ description: `Associations between contacts and logged emails` })
export class HubSpotContactEmail_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Email hs_object_id`}) 
    @MaxLength(100)
    email_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Emails
//****************************************************************************
@InputType()
export class CreateHubSpotContactEmailInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    email_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Emails
//****************************************************************************
@InputType()
export class UpdateHubSpotContactEmailInput {
    @Field()
    contact_id: string;

    @Field()
    email_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Emails
//****************************************************************************
@ObjectType()
export class RunHubSpotContactEmailViewResult {
    @Field(() => [HubSpotContactEmail_])
    Results: HubSpotContactEmail_[];

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

@Resolver(HubSpotContactEmail_)
export class HubSpotContactEmailResolver extends ResolverBase {
    @Query(() => RunHubSpotContactEmailViewResult)
    async RunHubSpotContactEmailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactEmailViewResult)
    async RunHubSpotContactEmailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactEmailViewResult)
    async RunHubSpotContactEmailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactEmail_, { nullable: true })
    async HubSpotContactEmail(@Arg('contact_id', () => String) contact_id: string, @Arg('email_id', () => String) email_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactEmail_ | null> {
        this.CheckUserReadPermissions('Contact Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactEmails')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('email_id')}='${email_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactEmail_)
    async CreateHubSpotContactEmail(
        @Arg('input', () => CreateHubSpotContactEmailInput) input: CreateHubSpotContactEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactEmail_)
    async UpdateHubSpotContactEmail(
        @Arg('input', () => UpdateHubSpotContactEmailInput) input: UpdateHubSpotContactEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactEmail_)
    async DeleteHubSpotContactEmail(@Arg('contact_id', () => String) contact_id: string, @Arg('email_id', () => String) email_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'email_id', Value: email_id}]);
        return this.DeleteRecord('Contact Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Feedback Submissions
//****************************************************************************
@ObjectType({ description: `Associations between contacts and feedback submissions` })
export class HubSpotContactFeedbackSubmission_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot FeedbackSubmission hs_object_id`}) 
    @MaxLength(100)
    feedback_submission_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Feedback Submissions
//****************************************************************************
@InputType()
export class CreateHubSpotContactFeedbackSubmissionInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    feedback_submission_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Feedback Submissions
//****************************************************************************
@InputType()
export class UpdateHubSpotContactFeedbackSubmissionInput {
    @Field()
    contact_id: string;

    @Field()
    feedback_submission_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Feedback Submissions
//****************************************************************************
@ObjectType()
export class RunHubSpotContactFeedbackSubmissionViewResult {
    @Field(() => [HubSpotContactFeedbackSubmission_])
    Results: HubSpotContactFeedbackSubmission_[];

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

@Resolver(HubSpotContactFeedbackSubmission_)
export class HubSpotContactFeedbackSubmissionResolver extends ResolverBase {
    @Query(() => RunHubSpotContactFeedbackSubmissionViewResult)
    async RunHubSpotContactFeedbackSubmissionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactFeedbackSubmissionViewResult)
    async RunHubSpotContactFeedbackSubmissionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactFeedbackSubmissionViewResult)
    async RunHubSpotContactFeedbackSubmissionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Feedback Submissions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactFeedbackSubmission_, { nullable: true })
    async HubSpotContactFeedbackSubmission(@Arg('contact_id', () => String) contact_id: string, @Arg('feedback_submission_id', () => String) feedback_submission_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactFeedbackSubmission_ | null> {
        this.CheckUserReadPermissions('Contact Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('feedback_submission_id')}='${feedback_submission_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Feedback Submissions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactFeedbackSubmission_)
    async CreateHubSpotContactFeedbackSubmission(
        @Arg('input', () => CreateHubSpotContactFeedbackSubmissionInput) input: CreateHubSpotContactFeedbackSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Feedback Submissions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactFeedbackSubmission_)
    async UpdateHubSpotContactFeedbackSubmission(
        @Arg('input', () => UpdateHubSpotContactFeedbackSubmissionInput) input: UpdateHubSpotContactFeedbackSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Feedback Submissions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactFeedbackSubmission_)
    async DeleteHubSpotContactFeedbackSubmission(@Arg('contact_id', () => String) contact_id: string, @Arg('feedback_submission_id', () => String) feedback_submission_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'feedback_submission_id', Value: feedback_submission_id}]);
        return this.DeleteRecord('Contact Feedback Submissions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Meetings
//****************************************************************************
@ObjectType({ description: `Associations between contacts and meetings` })
export class HubSpotContactMeeting_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Meeting hs_object_id`}) 
    @MaxLength(100)
    meeting_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Meetings
//****************************************************************************
@InputType()
export class CreateHubSpotContactMeetingInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    meeting_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Meetings
//****************************************************************************
@InputType()
export class UpdateHubSpotContactMeetingInput {
    @Field()
    contact_id: string;

    @Field()
    meeting_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Meetings
//****************************************************************************
@ObjectType()
export class RunHubSpotContactMeetingViewResult {
    @Field(() => [HubSpotContactMeeting_])
    Results: HubSpotContactMeeting_[];

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

@Resolver(HubSpotContactMeeting_)
export class HubSpotContactMeetingResolver extends ResolverBase {
    @Query(() => RunHubSpotContactMeetingViewResult)
    async RunHubSpotContactMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactMeetingViewResult)
    async RunHubSpotContactMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactMeetingViewResult)
    async RunHubSpotContactMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactMeeting_, { nullable: true })
    async HubSpotContactMeeting(@Arg('contact_id', () => String) contact_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactMeeting_ | null> {
        this.CheckUserReadPermissions('Contact Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactMeetings')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('meeting_id')}='${meeting_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Meetings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactMeeting_)
    async CreateHubSpotContactMeeting(
        @Arg('input', () => CreateHubSpotContactMeetingInput) input: CreateHubSpotContactMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactMeeting_)
    async UpdateHubSpotContactMeeting(
        @Arg('input', () => UpdateHubSpotContactMeetingInput) input: UpdateHubSpotContactMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactMeeting_)
    async DeleteHubSpotContactMeeting(@Arg('contact_id', () => String) contact_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'meeting_id', Value: meeting_id}]);
        return this.DeleteRecord('Contact Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Notes
//****************************************************************************
@ObjectType({ description: `Associations between contacts and notes` })
export class HubSpotContactNote_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Note hs_object_id`}) 
    @MaxLength(100)
    note_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Notes
//****************************************************************************
@InputType()
export class CreateHubSpotContactNoteInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    note_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Notes
//****************************************************************************
@InputType()
export class UpdateHubSpotContactNoteInput {
    @Field()
    contact_id: string;

    @Field()
    note_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Notes
//****************************************************************************
@ObjectType()
export class RunHubSpotContactNoteViewResult {
    @Field(() => [HubSpotContactNote_])
    Results: HubSpotContactNote_[];

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

@Resolver(HubSpotContactNote_)
export class HubSpotContactNoteResolver extends ResolverBase {
    @Query(() => RunHubSpotContactNoteViewResult)
    async RunHubSpotContactNoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactNoteViewResult)
    async RunHubSpotContactNoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactNoteViewResult)
    async RunHubSpotContactNoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Notes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactNote_, { nullable: true })
    async HubSpotContactNote(@Arg('contact_id', () => String) contact_id: string, @Arg('note_id', () => String) note_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactNote_ | null> {
        this.CheckUserReadPermissions('Contact Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactNotes')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('note_id')}='${note_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Notes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactNote_)
    async CreateHubSpotContactNote(
        @Arg('input', () => CreateHubSpotContactNoteInput) input: CreateHubSpotContactNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Notes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactNote_)
    async UpdateHubSpotContactNote(
        @Arg('input', () => UpdateHubSpotContactNoteInput) input: UpdateHubSpotContactNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Notes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactNote_)
    async DeleteHubSpotContactNote(@Arg('contact_id', () => String) contact_id: string, @Arg('note_id', () => String) note_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'note_id', Value: note_id}]);
        return this.DeleteRecord('Contact Notes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Tasks
//****************************************************************************
@ObjectType({ description: `Associations between contacts and tasks` })
export class HubSpotContactTask_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Task hs_object_id`}) 
    @MaxLength(100)
    task_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Tasks
//****************************************************************************
@InputType()
export class CreateHubSpotContactTaskInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    task_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Tasks
//****************************************************************************
@InputType()
export class UpdateHubSpotContactTaskInput {
    @Field()
    contact_id: string;

    @Field()
    task_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Tasks
//****************************************************************************
@ObjectType()
export class RunHubSpotContactTaskViewResult {
    @Field(() => [HubSpotContactTask_])
    Results: HubSpotContactTask_[];

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

@Resolver(HubSpotContactTask_)
export class HubSpotContactTaskResolver extends ResolverBase {
    @Query(() => RunHubSpotContactTaskViewResult)
    async RunHubSpotContactTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactTaskViewResult)
    async RunHubSpotContactTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactTaskViewResult)
    async RunHubSpotContactTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactTask_, { nullable: true })
    async HubSpotContactTask(@Arg('contact_id', () => String) contact_id: string, @Arg('task_id', () => String) task_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactTask_ | null> {
        this.CheckUserReadPermissions('Contact Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactTasks')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('task_id')}='${task_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Tasks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactTask_)
    async CreateHubSpotContactTask(
        @Arg('input', () => CreateHubSpotContactTaskInput) input: CreateHubSpotContactTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactTask_)
    async UpdateHubSpotContactTask(
        @Arg('input', () => UpdateHubSpotContactTaskInput) input: UpdateHubSpotContactTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactTask_)
    async DeleteHubSpotContactTask(@Arg('contact_id', () => String) contact_id: string, @Arg('task_id', () => String) task_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'task_id', Value: task_id}]);
        return this.DeleteRecord('Contact Tasks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Tickets
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between contacts and support tickets` })
export class HubSpotContactTicket_ {
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Tickets
//****************************************************************************
@InputType()
export class CreateHubSpotContactTicketInput {
    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Tickets
//****************************************************************************
@InputType()
export class UpdateHubSpotContactTicketInput {
    @Field()
    contact_id: string;

    @Field()
    ticket_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Tickets
//****************************************************************************
@ObjectType()
export class RunHubSpotContactTicketViewResult {
    @Field(() => [HubSpotContactTicket_])
    Results: HubSpotContactTicket_[];

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

@Resolver(HubSpotContactTicket_)
export class HubSpotContactTicketResolver extends ResolverBase {
    @Query(() => RunHubSpotContactTicketViewResult)
    async RunHubSpotContactTicketViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactTicketViewResult)
    async RunHubSpotContactTicketViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactTicketViewResult)
    async RunHubSpotContactTicketDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Tickets';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContactTicket_, { nullable: true })
    async HubSpotContactTicket(@Arg('contact_id', () => String) contact_id: string, @Arg('ticket_id', () => String) ticket_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContactTicket_ | null> {
        this.CheckUserReadPermissions('Contact Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactTickets')} WHERE ${provider.QuoteIdentifier('contact_id')}='${contact_id}' AND ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Tickets', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotContactTicket_)
    async CreateHubSpotContactTicket(
        @Arg('input', () => CreateHubSpotContactTicketInput) input: CreateHubSpotContactTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Tickets', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContactTicket_)
    async UpdateHubSpotContactTicket(
        @Arg('input', () => UpdateHubSpotContactTicketInput) input: UpdateHubSpotContactTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Tickets', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContactTicket_)
    async DeleteHubSpotContactTicket(@Arg('contact_id', () => String) contact_id: string, @Arg('ticket_id', () => String) ticket_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}, {FieldName: 'ticket_id', Value: ticket_id}]);
        return this.DeleteRecord('Contact Tickets', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `CRM contacts with personal, professional, and lifecycle information` })
export class HubSpotContact_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    firstname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    lastname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    mobilephone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    company?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    jobtitle?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    lifecyclestage?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_lead_status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    city?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    state?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    zip?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    industry?: string;
        
    @Field(() => Float, {nullable: true}) 
    annualrevenue?: number;
        
    @Field(() => Int, {nullable: true}) 
    numberofemployees?: number;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    lastmodifieddate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    associatedcompanyid?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    notes_last_contacted?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    notes_last_updated?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    hs_email_optout?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotContactTask_])
    HubSpotContactTasks_contact_idArray: HubSpotContactTask_[]; // Link to HubSpotContactTasks
    
    @Field(() => [HubSpotContactFeedbackSubmission_])
    HubSpotContactFeedbackSubmissions_contact_idArray: HubSpotContactFeedbackSubmission_[]; // Link to HubSpotContactFeedbackSubmissions
    
    @Field(() => [HubSpotContactCompany_])
    HubSpotContactCompanies_contact_idArray: HubSpotContactCompany_[]; // Link to HubSpotContactCompanies
    
    @Field(() => [HubSpotContactEmail_])
    HubSpotContactEmails_contact_idArray: HubSpotContactEmail_[]; // Link to HubSpotContactEmails
    
    @Field(() => [HubSpotQuoteContact_])
    HubSpotQuoteContacts_contact_idArray: HubSpotQuoteContact_[]; // Link to HubSpotQuoteContacts
    
    @Field(() => [HubSpotContactDeal_])
    HubSpotContactDeals_contact_idArray: HubSpotContactDeal_[]; // Link to HubSpotContactDeals
    
    @Field(() => [HubSpotContactTicket_])
    HubSpotContactTickets_contact_idArray: HubSpotContactTicket_[]; // Link to HubSpotContactTickets
    
    @Field(() => [HubSpotContactCall_])
    HubSpotContactCalls_contact_idArray: HubSpotContactCall_[]; // Link to HubSpotContactCalls
    
    @Field(() => [YourMembershipEmailSuppressionList_])
    YourMembershipEmailSuppressionLists_EmailArray: YourMembershipEmailSuppressionList_[]; // Link to YourMembershipEmailSuppressionLists
    
    @Field(() => [YourMembershipInvoiceItem_])
    YourMembershipInvoiceItems_EmailAddressArray: YourMembershipInvoiceItem_[]; // Link to YourMembershipInvoiceItems
    
    @Field(() => [YourMembershipConnection_])
    YourMembershipConnections_EmailArray: YourMembershipConnection_[]; // Link to YourMembershipConnections
    
    @Field(() => [YourMembershipGroupMembershipLog_])
    YourMembershipGroupMembershipLogs_LastNameArray: YourMembershipGroupMembershipLog_[]; // Link to YourMembershipGroupMembershipLogs
    
    @Field(() => [YourMembershipEventRegistration_])
    YourMembershipEventRegistrations_FirstNameArray: YourMembershipEventRegistration_[]; // Link to YourMembershipEventRegistrations
    
    @Field(() => [YourMembershipDuesTransaction_])
    YourMembershipDuesTransactions_LastNameArray: YourMembershipDuesTransaction_[]; // Link to YourMembershipDuesTransactions
    
    @Field(() => [HubSpotContactNote_])
    HubSpotContactNotes_contact_idArray: HubSpotContactNote_[]; // Link to HubSpotContactNotes
    
    @Field(() => [HubSpotContactMeeting_])
    HubSpotContactMeetings_contact_idArray: HubSpotContactMeeting_[]; // Link to HubSpotContactMeetings
    
    @Field(() => [YourMembershipDonationTransaction_])
    YourMembershipDonationTransactions_FirstNameArray: YourMembershipDonationTransaction_[]; // Link to YourMembershipDonationTransactions
    
    @Field(() => [YourMembershipGroupMembershipLog_])
    YourMembershipGroupMembershipLogs_FirstNameArray: YourMembershipGroupMembershipLog_[]; // Link to YourMembershipGroupMembershipLogs
    
    @Field(() => [YourMembershipConnection_])
    YourMembershipConnections_LastNameArray: YourMembershipConnection_[]; // Link to YourMembershipConnections
    
    @Field(() => [YourMembershipEventRegistration_])
    YourMembershipEventRegistrations_LastNameArray: YourMembershipEventRegistration_[]; // Link to YourMembershipEventRegistrations
    
    @Field(() => [YourMembershipDuesTransaction_])
    YourMembershipDuesTransactions_FirstNameArray: YourMembershipDuesTransaction_[]; // Link to YourMembershipDuesTransactions
    
    @Field(() => [YourMembershipDonationTransaction_])
    YourMembershipDonationTransactions_LastNameArray: YourMembershipDonationTransaction_[]; // Link to YourMembershipDonationTransactions
    
    @Field(() => [YourMembershipConnection_])
    YourMembershipConnections_FirstNameArray: YourMembershipConnection_[]; // Link to YourMembershipConnections
    
    @Field(() => [YourMembershipDuesTransaction_])
    YourMembershipDuesTransactions_EmailArray: YourMembershipDuesTransaction_[]; // Link to YourMembershipDuesTransactions
    
    @Field(() => [YourMembershipMemberProfile_])
    YourMembershipMemberProfiles_EmailAddressArray: YourMembershipMemberProfile_[]; // Link to YourMembershipMemberProfiles
    
    @Field(() => [YourMembershipMemberProfile_])
    YourMembershipMemberProfiles_FirstNameArray: YourMembershipMemberProfile_[]; // Link to YourMembershipMemberProfiles
    
    @Field(() => [YourMembershipMemberProfile_])
    YourMembershipMemberProfiles_LastNameArray: YourMembershipMemberProfile_[]; // Link to YourMembershipMemberProfiles
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateHubSpotContactInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    email: string | null;

    @Field({ nullable: true })
    firstname: string | null;

    @Field({ nullable: true })
    lastname: string | null;

    @Field({ nullable: true })
    phone: string | null;

    @Field({ nullable: true })
    mobilephone: string | null;

    @Field({ nullable: true })
    company: string | null;

    @Field({ nullable: true })
    jobtitle: string | null;

    @Field({ nullable: true })
    lifecyclestage: string | null;

    @Field({ nullable: true })
    hs_lead_status: string | null;

    @Field({ nullable: true })
    address: string | null;

    @Field({ nullable: true })
    city: string | null;

    @Field({ nullable: true })
    state: string | null;

    @Field({ nullable: true })
    zip: string | null;

    @Field({ nullable: true })
    country: string | null;

    @Field({ nullable: true })
    website: string | null;

    @Field({ nullable: true })
    industry: string | null;

    @Field(() => Float, { nullable: true })
    annualrevenue: number | null;

    @Field(() => Int, { nullable: true })
    numberofemployees: number | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    lastmodifieddate: Date | null;

    @Field({ nullable: true })
    associatedcompanyid: string | null;

    @Field({ nullable: true })
    notes_last_contacted: string | null;

    @Field({ nullable: true })
    notes_last_updated: string | null;

    @Field(() => Boolean, { nullable: true })
    hs_email_optout: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdateHubSpotContactInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    email?: string | null;

    @Field({ nullable: true })
    firstname?: string | null;

    @Field({ nullable: true })
    lastname?: string | null;

    @Field({ nullable: true })
    phone?: string | null;

    @Field({ nullable: true })
    mobilephone?: string | null;

    @Field({ nullable: true })
    company?: string | null;

    @Field({ nullable: true })
    jobtitle?: string | null;

    @Field({ nullable: true })
    lifecyclestage?: string | null;

    @Field({ nullable: true })
    hs_lead_status?: string | null;

    @Field({ nullable: true })
    address?: string | null;

    @Field({ nullable: true })
    city?: string | null;

    @Field({ nullable: true })
    state?: string | null;

    @Field({ nullable: true })
    zip?: string | null;

    @Field({ nullable: true })
    country?: string | null;

    @Field({ nullable: true })
    website?: string | null;

    @Field({ nullable: true })
    industry?: string | null;

    @Field(() => Float, { nullable: true })
    annualrevenue?: number | null;

    @Field(() => Int, { nullable: true })
    numberofemployees?: number | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    associatedcompanyid?: string | null;

    @Field({ nullable: true })
    notes_last_contacted?: string | null;

    @Field({ nullable: true })
    notes_last_updated?: string | null;

    @Field(() => Boolean, { nullable: true })
    hs_email_optout?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunHubSpotContactViewResult {
    @Field(() => [HubSpotContact_])
    Results: HubSpotContact_[];

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

@Resolver(HubSpotContact_)
export class HubSpotContactResolver extends ResolverBase {
    @Query(() => RunHubSpotContactViewResult)
    async RunHubSpotContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactViewResult)
    async RunHubSpotContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotContactViewResult)
    async RunHubSpotContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotContact_, { nullable: true })
    async HubSpotContact(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotContact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotContactTask_])
    async HubSpotContactTasks_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactTasks')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactFeedbackSubmission_])
    async HubSpotContactFeedbackSubmissions_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Feedback Submissions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactCompany_])
    async HubSpotContactCompanies_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactCompanies')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactEmail_])
    async HubSpotContactEmails_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactEmails')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotQuoteContact_])
    async HubSpotQuoteContacts_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Quote Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuoteContacts')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quote Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Quote Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactDeal_])
    async HubSpotContactDeals_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactDeals')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Deals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactTicket_])
    async HubSpotContactTickets_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactTickets')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactCall_])
    async HubSpotContactCalls_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactCalls')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEmailSuppressionList_])
    async YourMembershipEmailSuppressionLists_EmailArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Suppression Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEmailSuppressionLists')} WHERE ${provider.QuoteIdentifier('Email')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Suppression Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Suppression Lists', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipInvoiceItem_])
    async YourMembershipInvoiceItems_EmailAddressArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwInvoiceItems')} WHERE ${provider.QuoteIdentifier('EmailAddress')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipConnection_])
    async YourMembershipConnections_EmailArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Connections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwConnections')} WHERE ${provider.QuoteIdentifier('Email')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Connections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Connections', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipGroupMembershipLog_])
    async YourMembershipGroupMembershipLogs_LastNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Group Membership Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroupMembershipLogs')} WHERE ${provider.QuoteIdentifier('LastName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Group Membership Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Group Membership Logs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventRegistration_])
    async YourMembershipEventRegistrations_FirstNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('FirstName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDuesTransaction_])
    async YourMembershipDuesTransactions_LastNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dues Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesTransactions')} WHERE ${provider.QuoteIdentifier('LastName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dues Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactNote_])
    async HubSpotContactNotes_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactNotes')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactMeeting_])
    async HubSpotContactMeetings_contact_idArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactMeetings')} WHERE ${provider.QuoteIdentifier('contact_id')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDonationTransaction_])
    async YourMembershipDonationTransactions_FirstNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donation Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationTransactions')} WHERE ${provider.QuoteIdentifier('FirstName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donation Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipGroupMembershipLog_])
    async YourMembershipGroupMembershipLogs_FirstNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Group Membership Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroupMembershipLogs')} WHERE ${provider.QuoteIdentifier('FirstName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Group Membership Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Group Membership Logs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipConnection_])
    async YourMembershipConnections_LastNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Connections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwConnections')} WHERE ${provider.QuoteIdentifier('LastName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Connections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Connections', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventRegistration_])
    async YourMembershipEventRegistrations_LastNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('LastName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDuesTransaction_])
    async YourMembershipDuesTransactions_FirstNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dues Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesTransactions')} WHERE ${provider.QuoteIdentifier('FirstName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dues Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDonationTransaction_])
    async YourMembershipDonationTransactions_LastNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donation Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationTransactions')} WHERE ${provider.QuoteIdentifier('LastName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donation Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipConnection_])
    async YourMembershipConnections_FirstNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Connections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwConnections')} WHERE ${provider.QuoteIdentifier('FirstName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Connections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Connections', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDuesTransaction_])
    async YourMembershipDuesTransactions_EmailArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dues Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesTransactions')} WHERE ${provider.QuoteIdentifier('Email')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dues Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberProfile_])
    async YourMembershipMemberProfiles_EmailAddressArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Profiles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberProfiles')} WHERE ${provider.QuoteIdentifier('EmailAddress')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Profiles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Profiles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberProfile_])
    async YourMembershipMemberProfiles_FirstNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Profiles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberProfiles')} WHERE ${provider.QuoteIdentifier('FirstName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Profiles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Profiles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberProfile_])
    async YourMembershipMemberProfiles_LastNameArray(@Root() hubspotcontact_: HubSpotContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Profiles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberProfiles')} WHERE ${provider.QuoteIdentifier('LastName')}='${hubspotcontact_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Profiles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Profiles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotContact_)
    async CreateHubSpotContact(
        @Arg('input', () => CreateHubSpotContactInput) input: CreateHubSpotContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotContact_)
    async UpdateHubSpotContact(
        @Arg('input', () => UpdateHubSpotContactInput) input: UpdateHubSpotContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotContact_)
    async DeleteHubSpotContact(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Countries
//****************************************************************************
@ObjectType({ description: `Country reference list with default country designation` })
export class YourMembershipCountry_ {
    @Field() 
    @MaxLength(200)
    countryId: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    countryName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    countryCode?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipMember_])
    YourMembershipMembers_CountryArray: YourMembershipMember_[]; // Link to YourMembershipMembers
    
    @Field(() => [YourMembershipLocation_])
    YourMembershipLocations_countryIdArray: YourMembershipLocation_[]; // Link to YourMembershipLocations
    
}

//****************************************************************************
// INPUT TYPE for Countries
//****************************************************************************
@InputType()
export class CreateYourMembershipCountryInput {
    @Field({ nullable: true })
    countryId?: string;

    @Field({ nullable: true })
    countryName: string | null;

    @Field({ nullable: true })
    countryCode: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Countries
//****************************************************************************
@InputType()
export class UpdateYourMembershipCountryInput {
    @Field()
    countryId: string;

    @Field({ nullable: true })
    countryName?: string | null;

    @Field({ nullable: true })
    countryCode?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Countries
//****************************************************************************
@ObjectType()
export class RunYourMembershipCountryViewResult {
    @Field(() => [YourMembershipCountry_])
    Results: YourMembershipCountry_[];

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

@Resolver(YourMembershipCountry_)
export class YourMembershipCountryResolver extends ResolverBase {
    @Query(() => RunYourMembershipCountryViewResult)
    async RunYourMembershipCountryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCountryViewResult)
    async RunYourMembershipCountryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCountryViewResult)
    async RunYourMembershipCountryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Countries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCountry_, { nullable: true })
    async YourMembershipCountry(@Arg('countryId', () => String) countryId: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCountry_ | null> {
        this.CheckUserReadPermissions('Countries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCountries')} WHERE ${provider.QuoteIdentifier('countryId')}='${countryId}' ` + this.getRowLevelSecurityWhereClause(provider, 'Countries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Countries', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipMember_])
    async YourMembershipMembers_CountryArray(@Root() yourmembershipcountry_: YourMembershipCountry_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembers')} WHERE ${provider.QuoteIdentifier('Country')}='${yourmembershipcountry_.countryId}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipLocation_])
    async YourMembershipLocations_countryIdArray(@Root() yourmembershipcountry_: YourMembershipCountry_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Locations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwLocations')} WHERE ${provider.QuoteIdentifier('countryId')}='${yourmembershipcountry_.countryId}' ` + this.getRowLevelSecurityWhereClause(provider, 'Locations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Locations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipCountry_)
    async CreateYourMembershipCountry(
        @Arg('input', () => CreateYourMembershipCountryInput) input: CreateYourMembershipCountryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Countries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCountry_)
    async UpdateYourMembershipCountry(
        @Arg('input', () => UpdateYourMembershipCountryInput) input: UpdateYourMembershipCountryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Countries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCountry_)
    async DeleteYourMembershipCountry(@Arg('countryId', () => String) countryId: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'countryId', Value: countryId}]);
        return this.DeleteRecord('Countries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Custom Tax Locations
//****************************************************************************
@ObjectType({ description: `Locations with custom tax rate overrides for commerce transactions` })
export class YourMembershipCustomTaxLocation_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CountryLabel?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Location?: string;
        
    @Field(() => Float, {nullable: true}) 
    TaxRate?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Custom Tax Locations
//****************************************************************************
@InputType()
export class CreateYourMembershipCustomTaxLocationInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    CountryLabel: string | null;

    @Field({ nullable: true })
    Location: string | null;

    @Field(() => Float, { nullable: true })
    TaxRate: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Custom Tax Locations
//****************************************************************************
@InputType()
export class UpdateYourMembershipCustomTaxLocationInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    CountryLabel?: string | null;

    @Field({ nullable: true })
    Location?: string | null;

    @Field(() => Float, { nullable: true })
    TaxRate?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Custom Tax Locations
//****************************************************************************
@ObjectType()
export class RunYourMembershipCustomTaxLocationViewResult {
    @Field(() => [YourMembershipCustomTaxLocation_])
    Results: YourMembershipCustomTaxLocation_[];

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

@Resolver(YourMembershipCustomTaxLocation_)
export class YourMembershipCustomTaxLocationResolver extends ResolverBase {
    @Query(() => RunYourMembershipCustomTaxLocationViewResult)
    async RunYourMembershipCustomTaxLocationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCustomTaxLocationViewResult)
    async RunYourMembershipCustomTaxLocationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipCustomTaxLocationViewResult)
    async RunYourMembershipCustomTaxLocationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Custom Tax Locations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipCustomTaxLocation_, { nullable: true })
    async YourMembershipCustomTaxLocation(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipCustomTaxLocation_ | null> {
        this.CheckUserReadPermissions('Custom Tax Locations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCustomTaxLocations')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Custom Tax Locations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Custom Tax Locations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipCustomTaxLocation_)
    async CreateYourMembershipCustomTaxLocation(
        @Arg('input', () => CreateYourMembershipCustomTaxLocationInput) input: CreateYourMembershipCustomTaxLocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Custom Tax Locations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipCustomTaxLocation_)
    async UpdateYourMembershipCustomTaxLocation(
        @Arg('input', () => UpdateYourMembershipCustomTaxLocationInput) input: UpdateYourMembershipCustomTaxLocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Custom Tax Locations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipCustomTaxLocation_)
    async DeleteYourMembershipCustomTaxLocation(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Custom Tax Locations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Calls
//****************************************************************************
@ObjectType({ description: `Associations between deals and logged calls` })
export class HubSpotDealCall_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot Call hs_object_id`}) 
    @MaxLength(100)
    call_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Calls
//****************************************************************************
@InputType()
export class CreateHubSpotDealCallInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    call_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Calls
//****************************************************************************
@InputType()
export class UpdateHubSpotDealCallInput {
    @Field()
    deal_id: string;

    @Field()
    call_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Calls
//****************************************************************************
@ObjectType()
export class RunHubSpotDealCallViewResult {
    @Field(() => [HubSpotDealCall_])
    Results: HubSpotDealCall_[];

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

@Resolver(HubSpotDealCall_)
export class HubSpotDealCallResolver extends ResolverBase {
    @Query(() => RunHubSpotDealCallViewResult)
    async RunHubSpotDealCallViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealCallViewResult)
    async RunHubSpotDealCallViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealCallViewResult)
    async RunHubSpotDealCallDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Calls';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealCall_, { nullable: true })
    async HubSpotDealCall(@Arg('deal_id', () => String) deal_id: string, @Arg('call_id', () => String) call_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealCall_ | null> {
        this.CheckUserReadPermissions('Deal Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealCalls')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('call_id')}='${call_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Calls', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealCall_)
    async CreateHubSpotDealCall(
        @Arg('input', () => CreateHubSpotDealCallInput) input: CreateHubSpotDealCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Calls', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealCall_)
    async UpdateHubSpotDealCall(
        @Arg('input', () => UpdateHubSpotDealCallInput) input: UpdateHubSpotDealCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Calls', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealCall_)
    async DeleteHubSpotDealCall(@Arg('deal_id', () => String) deal_id: string, @Arg('call_id', () => String) call_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'call_id', Value: call_id}]);
        return this.DeleteRecord('Deal Calls', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Emails
//****************************************************************************
@ObjectType({ description: `Associations between deals and logged emails` })
export class HubSpotDealEmail_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot Email hs_object_id`}) 
    @MaxLength(100)
    email_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Emails
//****************************************************************************
@InputType()
export class CreateHubSpotDealEmailInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    email_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Emails
//****************************************************************************
@InputType()
export class UpdateHubSpotDealEmailInput {
    @Field()
    deal_id: string;

    @Field()
    email_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Emails
//****************************************************************************
@ObjectType()
export class RunHubSpotDealEmailViewResult {
    @Field(() => [HubSpotDealEmail_])
    Results: HubSpotDealEmail_[];

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

@Resolver(HubSpotDealEmail_)
export class HubSpotDealEmailResolver extends ResolverBase {
    @Query(() => RunHubSpotDealEmailViewResult)
    async RunHubSpotDealEmailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealEmailViewResult)
    async RunHubSpotDealEmailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealEmailViewResult)
    async RunHubSpotDealEmailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealEmail_, { nullable: true })
    async HubSpotDealEmail(@Arg('deal_id', () => String) deal_id: string, @Arg('email_id', () => String) email_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealEmail_ | null> {
        this.CheckUserReadPermissions('Deal Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealEmails')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('email_id')}='${email_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealEmail_)
    async CreateHubSpotDealEmail(
        @Arg('input', () => CreateHubSpotDealEmailInput) input: CreateHubSpotDealEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealEmail_)
    async UpdateHubSpotDealEmail(
        @Arg('input', () => UpdateHubSpotDealEmailInput) input: UpdateHubSpotDealEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealEmail_)
    async DeleteHubSpotDealEmail(@Arg('deal_id', () => String) deal_id: string, @Arg('email_id', () => String) email_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'email_id', Value: email_id}]);
        return this.DeleteRecord('Deal Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Line Items
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between deals and line items` })
export class HubSpotDealLineItem_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot LineItem hs_object_id`}) 
    @MaxLength(100)
    line_item_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Line Items
//****************************************************************************
@InputType()
export class CreateHubSpotDealLineItemInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    line_item_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Line Items
//****************************************************************************
@InputType()
export class UpdateHubSpotDealLineItemInput {
    @Field()
    deal_id: string;

    @Field()
    line_item_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Line Items
//****************************************************************************
@ObjectType()
export class RunHubSpotDealLineItemViewResult {
    @Field(() => [HubSpotDealLineItem_])
    Results: HubSpotDealLineItem_[];

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

@Resolver(HubSpotDealLineItem_)
export class HubSpotDealLineItemResolver extends ResolverBase {
    @Query(() => RunHubSpotDealLineItemViewResult)
    async RunHubSpotDealLineItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealLineItemViewResult)
    async RunHubSpotDealLineItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealLineItemViewResult)
    async RunHubSpotDealLineItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Line Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealLineItem_, { nullable: true })
    async HubSpotDealLineItem(@Arg('deal_id', () => String) deal_id: string, @Arg('line_item_id', () => String) line_item_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealLineItem_ | null> {
        this.CheckUserReadPermissions('Deal Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealLineItems')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('line_item_id')}='${line_item_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Line Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealLineItem_)
    async CreateHubSpotDealLineItem(
        @Arg('input', () => CreateHubSpotDealLineItemInput) input: CreateHubSpotDealLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Line Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealLineItem_)
    async UpdateHubSpotDealLineItem(
        @Arg('input', () => UpdateHubSpotDealLineItemInput) input: UpdateHubSpotDealLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Line Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealLineItem_)
    async DeleteHubSpotDealLineItem(@Arg('deal_id', () => String) deal_id: string, @Arg('line_item_id', () => String) line_item_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'line_item_id', Value: line_item_id}]);
        return this.DeleteRecord('Deal Line Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Meetings
//****************************************************************************
@ObjectType({ description: `Associations between deals and meetings` })
export class HubSpotDealMeeting_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot Meeting hs_object_id`}) 
    @MaxLength(100)
    meeting_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Meetings
//****************************************************************************
@InputType()
export class CreateHubSpotDealMeetingInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    meeting_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Meetings
//****************************************************************************
@InputType()
export class UpdateHubSpotDealMeetingInput {
    @Field()
    deal_id: string;

    @Field()
    meeting_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Meetings
//****************************************************************************
@ObjectType()
export class RunHubSpotDealMeetingViewResult {
    @Field(() => [HubSpotDealMeeting_])
    Results: HubSpotDealMeeting_[];

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

@Resolver(HubSpotDealMeeting_)
export class HubSpotDealMeetingResolver extends ResolverBase {
    @Query(() => RunHubSpotDealMeetingViewResult)
    async RunHubSpotDealMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealMeetingViewResult)
    async RunHubSpotDealMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealMeetingViewResult)
    async RunHubSpotDealMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealMeeting_, { nullable: true })
    async HubSpotDealMeeting(@Arg('deal_id', () => String) deal_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealMeeting_ | null> {
        this.CheckUserReadPermissions('Deal Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealMeetings')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('meeting_id')}='${meeting_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Meetings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealMeeting_)
    async CreateHubSpotDealMeeting(
        @Arg('input', () => CreateHubSpotDealMeetingInput) input: CreateHubSpotDealMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealMeeting_)
    async UpdateHubSpotDealMeeting(
        @Arg('input', () => UpdateHubSpotDealMeetingInput) input: UpdateHubSpotDealMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealMeeting_)
    async DeleteHubSpotDealMeeting(@Arg('deal_id', () => String) deal_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'meeting_id', Value: meeting_id}]);
        return this.DeleteRecord('Deal Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Notes
//****************************************************************************
@ObjectType({ description: `Associations between deals and notes` })
export class HubSpotDealNote_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot Note hs_object_id`}) 
    @MaxLength(100)
    note_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Notes
//****************************************************************************
@InputType()
export class CreateHubSpotDealNoteInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    note_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Notes
//****************************************************************************
@InputType()
export class UpdateHubSpotDealNoteInput {
    @Field()
    deal_id: string;

    @Field()
    note_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Notes
//****************************************************************************
@ObjectType()
export class RunHubSpotDealNoteViewResult {
    @Field(() => [HubSpotDealNote_])
    Results: HubSpotDealNote_[];

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

@Resolver(HubSpotDealNote_)
export class HubSpotDealNoteResolver extends ResolverBase {
    @Query(() => RunHubSpotDealNoteViewResult)
    async RunHubSpotDealNoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealNoteViewResult)
    async RunHubSpotDealNoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealNoteViewResult)
    async RunHubSpotDealNoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Notes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealNote_, { nullable: true })
    async HubSpotDealNote(@Arg('deal_id', () => String) deal_id: string, @Arg('note_id', () => String) note_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealNote_ | null> {
        this.CheckUserReadPermissions('Deal Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealNotes')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('note_id')}='${note_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Notes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealNote_)
    async CreateHubSpotDealNote(
        @Arg('input', () => CreateHubSpotDealNoteInput) input: CreateHubSpotDealNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Notes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealNote_)
    async UpdateHubSpotDealNote(
        @Arg('input', () => UpdateHubSpotDealNoteInput) input: UpdateHubSpotDealNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Notes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealNote_)
    async DeleteHubSpotDealNote(@Arg('deal_id', () => String) deal_id: string, @Arg('note_id', () => String) note_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'note_id', Value: note_id}]);
        return this.DeleteRecord('Deal Notes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Quotes
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between deals and quotes` })
export class HubSpotDealQuote_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot Quote hs_object_id`}) 
    @MaxLength(100)
    quote_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Quotes
//****************************************************************************
@InputType()
export class CreateHubSpotDealQuoteInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    quote_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Quotes
//****************************************************************************
@InputType()
export class UpdateHubSpotDealQuoteInput {
    @Field()
    deal_id: string;

    @Field()
    quote_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Quotes
//****************************************************************************
@ObjectType()
export class RunHubSpotDealQuoteViewResult {
    @Field(() => [HubSpotDealQuote_])
    Results: HubSpotDealQuote_[];

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

@Resolver(HubSpotDealQuote_)
export class HubSpotDealQuoteResolver extends ResolverBase {
    @Query(() => RunHubSpotDealQuoteViewResult)
    async RunHubSpotDealQuoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealQuoteViewResult)
    async RunHubSpotDealQuoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealQuoteViewResult)
    async RunHubSpotDealQuoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Quotes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealQuote_, { nullable: true })
    async HubSpotDealQuote(@Arg('deal_id', () => String) deal_id: string, @Arg('quote_id', () => String) quote_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealQuote_ | null> {
        this.CheckUserReadPermissions('Deal Quotes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealQuotes')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('quote_id')}='${quote_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Quotes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Quotes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealQuote_)
    async CreateHubSpotDealQuote(
        @Arg('input', () => CreateHubSpotDealQuoteInput) input: CreateHubSpotDealQuoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Quotes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealQuote_)
    async UpdateHubSpotDealQuote(
        @Arg('input', () => UpdateHubSpotDealQuoteInput) input: UpdateHubSpotDealQuoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Quotes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealQuote_)
    async DeleteHubSpotDealQuote(@Arg('deal_id', () => String) deal_id: string, @Arg('quote_id', () => String) quote_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'quote_id', Value: quote_id}]);
        return this.DeleteRecord('Deal Quotes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Tasks
//****************************************************************************
@ObjectType({ description: `Associations between deals and tasks` })
export class HubSpotDealTask_ {
    @Field({description: `HubSpot Deal hs_object_id`}) 
    @MaxLength(100)
    deal_id: string;
        
    @Field({description: `HubSpot Task hs_object_id`}) 
    @MaxLength(100)
    task_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Deal Tasks
//****************************************************************************
@InputType()
export class CreateHubSpotDealTaskInput {
    @Field({ nullable: true })
    deal_id?: string;

    @Field({ nullable: true })
    task_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Tasks
//****************************************************************************
@InputType()
export class UpdateHubSpotDealTaskInput {
    @Field()
    deal_id: string;

    @Field()
    task_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Tasks
//****************************************************************************
@ObjectType()
export class RunHubSpotDealTaskViewResult {
    @Field(() => [HubSpotDealTask_])
    Results: HubSpotDealTask_[];

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

@Resolver(HubSpotDealTask_)
export class HubSpotDealTaskResolver extends ResolverBase {
    @Query(() => RunHubSpotDealTaskViewResult)
    async RunHubSpotDealTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealTaskViewResult)
    async RunHubSpotDealTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealTaskViewResult)
    async RunHubSpotDealTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDealTask_, { nullable: true })
    async HubSpotDealTask(@Arg('deal_id', () => String) deal_id: string, @Arg('task_id', () => String) task_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDealTask_ | null> {
        this.CheckUserReadPermissions('Deal Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealTasks')} WHERE ${provider.QuoteIdentifier('deal_id')}='${deal_id}' AND ${provider.QuoteIdentifier('task_id')}='${task_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Tasks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotDealTask_)
    async CreateHubSpotDealTask(
        @Arg('input', () => CreateHubSpotDealTaskInput) input: CreateHubSpotDealTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDealTask_)
    async UpdateHubSpotDealTask(
        @Arg('input', () => UpdateHubSpotDealTaskInput) input: UpdateHubSpotDealTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDealTask_)
    async DeleteHubSpotDealTask(@Arg('deal_id', () => String) deal_id: string, @Arg('task_id', () => String) task_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'deal_id', Value: deal_id}, {FieldName: 'task_id', Value: task_id}]);
        return this.DeleteRecord('Deal Tasks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deals
//****************************************************************************
@ObjectType({ description: `Sales deals and opportunities with pipeline and stage tracking` })
export class HubSpotDeal_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    dealname?: string;
        
    @Field(() => Float, {nullable: true}) 
    amount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    dealstage?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    pipeline?: string;
        
    @Field({nullable: true}) 
    closedate?: Date;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    dealtype?: string;
        
    @Field({nullable: true}) 
    description?: string;
        
    @Field(() => Float, {nullable: true}) 
    hs_deal_stage_probability?: number;
        
    @Field(() => Float, {nullable: true}) 
    hs_projected_amount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_priority?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    notes_last_contacted?: string;
        
    @Field(() => Int, {nullable: true}) 
    num_associated_contacts?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotDealTask_])
    HubSpotDealTasks_deal_idArray: HubSpotDealTask_[]; // Link to HubSpotDealTasks
    
    @Field(() => [HubSpotDealEmail_])
    HubSpotDealEmails_deal_idArray: HubSpotDealEmail_[]; // Link to HubSpotDealEmails
    
    @Field(() => [HubSpotDealLineItem_])
    HubSpotDealLineItems_deal_idArray: HubSpotDealLineItem_[]; // Link to HubSpotDealLineItems
    
    @Field(() => [HubSpotDealNote_])
    HubSpotDealNotes_deal_idArray: HubSpotDealNote_[]; // Link to HubSpotDealNotes
    
    @Field(() => [HubSpotDealCall_])
    HubSpotDealCalls_deal_idArray: HubSpotDealCall_[]; // Link to HubSpotDealCalls
    
    @Field(() => [HubSpotDealMeeting_])
    HubSpotDealMeetings_deal_idArray: HubSpotDealMeeting_[]; // Link to HubSpotDealMeetings
    
    @Field(() => [HubSpotDealQuote_])
    HubSpotDealQuotes_deal_idArray: HubSpotDealQuote_[]; // Link to HubSpotDealQuotes
    
    @Field(() => [HubSpotContactDeal_])
    HubSpotContactDeals_deal_idArray: HubSpotContactDeal_[]; // Link to HubSpotContactDeals
    
    @Field(() => [HubSpotCompanyDeal_])
    HubSpotCompanyDeals_deal_idArray: HubSpotCompanyDeal_[]; // Link to HubSpotCompanyDeals
    
}

//****************************************************************************
// INPUT TYPE for Deals
//****************************************************************************
@InputType()
export class CreateHubSpotDealInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    dealname: string | null;

    @Field(() => Float, { nullable: true })
    amount: number | null;

    @Field({ nullable: true })
    dealstage: string | null;

    @Field({ nullable: true })
    pipeline: string | null;

    @Field({ nullable: true })
    closedate: Date | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    dealtype: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field(() => Float, { nullable: true })
    hs_deal_stage_probability: number | null;

    @Field(() => Float, { nullable: true })
    hs_projected_amount: number | null;

    @Field({ nullable: true })
    hs_priority: string | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    notes_last_contacted: string | null;

    @Field(() => Int, { nullable: true })
    num_associated_contacts: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Deals
//****************************************************************************
@InputType()
export class UpdateHubSpotDealInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    dealname?: string | null;

    @Field(() => Float, { nullable: true })
    amount?: number | null;

    @Field({ nullable: true })
    dealstage?: string | null;

    @Field({ nullable: true })
    pipeline?: string | null;

    @Field({ nullable: true })
    closedate?: Date | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    dealtype?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field(() => Float, { nullable: true })
    hs_deal_stage_probability?: number | null;

    @Field(() => Float, { nullable: true })
    hs_projected_amount?: number | null;

    @Field({ nullable: true })
    hs_priority?: string | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    notes_last_contacted?: string | null;

    @Field(() => Int, { nullable: true })
    num_associated_contacts?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deals
//****************************************************************************
@ObjectType()
export class RunHubSpotDealViewResult {
    @Field(() => [HubSpotDeal_])
    Results: HubSpotDeal_[];

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

@Resolver(HubSpotDeal_)
export class HubSpotDealResolver extends ResolverBase {
    @Query(() => RunHubSpotDealViewResult)
    async RunHubSpotDealViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealViewResult)
    async RunHubSpotDealViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotDealViewResult)
    async RunHubSpotDealDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotDeal_, { nullable: true })
    async HubSpotDeal(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotDeal_ | null> {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDeals')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deals', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotDealTask_])
    async HubSpotDealTasks_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealTasks')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealEmail_])
    async HubSpotDealEmails_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealEmails')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealLineItem_])
    async HubSpotDealLineItems_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealLineItems')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Line Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealNote_])
    async HubSpotDealNotes_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealNotes')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealCall_])
    async HubSpotDealCalls_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealCalls')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealMeeting_])
    async HubSpotDealMeetings_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealMeetings')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealQuote_])
    async HubSpotDealQuotes_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Quotes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealQuotes')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Quotes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Quotes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactDeal_])
    async HubSpotContactDeals_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactDeals')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Deals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyDeal_])
    async HubSpotCompanyDeals_deal_idArray(@Root() hubspotdeal_: HubSpotDeal_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyDeals')} WHERE ${provider.QuoteIdentifier('deal_id')}='${hubspotdeal_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Deals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotDeal_)
    async CreateHubSpotDeal(
        @Arg('input', () => CreateHubSpotDealInput) input: CreateHubSpotDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotDeal_)
    async UpdateHubSpotDeal(
        @Arg('input', () => UpdateHubSpotDealInput) input: UpdateHubSpotDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotDeal_)
    async DeleteHubSpotDeal(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Deals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Donation Funds
//****************************************************************************
@ObjectType({ description: `Donation fund definitions for directing charitable contributions` })
export class YourMembershipDonationFund_ {
    @Field(() => Int) 
    fundId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    fundName?: string;
        
    @Field(() => Int, {nullable: true}) 
    fundOptionsCount?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipDonationTransaction_])
    YourMembershipDonationTransactions_FundNameArray: YourMembershipDonationTransaction_[]; // Link to YourMembershipDonationTransactions
    
}

//****************************************************************************
// INPUT TYPE for Donation Funds
//****************************************************************************
@InputType()
export class CreateYourMembershipDonationFundInput {
    @Field(() => Int, { nullable: true })
    fundId?: number;

    @Field({ nullable: true })
    fundName: string | null;

    @Field(() => Int, { nullable: true })
    fundOptionsCount: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Donation Funds
//****************************************************************************
@InputType()
export class UpdateYourMembershipDonationFundInput {
    @Field(() => Int)
    fundId: number;

    @Field({ nullable: true })
    fundName?: string | null;

    @Field(() => Int, { nullable: true })
    fundOptionsCount?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Donation Funds
//****************************************************************************
@ObjectType()
export class RunYourMembershipDonationFundViewResult {
    @Field(() => [YourMembershipDonationFund_])
    Results: YourMembershipDonationFund_[];

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

@Resolver(YourMembershipDonationFund_)
export class YourMembershipDonationFundResolver extends ResolverBase {
    @Query(() => RunYourMembershipDonationFundViewResult)
    async RunYourMembershipDonationFundViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDonationFundViewResult)
    async RunYourMembershipDonationFundViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDonationFundViewResult)
    async RunYourMembershipDonationFundDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Donation Funds';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipDonationFund_, { nullable: true })
    async YourMembershipDonationFund(@Arg('fundId', () => Int) fundId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipDonationFund_ | null> {
        this.CheckUserReadPermissions('Donation Funds', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationFunds')} WHERE ${provider.QuoteIdentifier('fundId')}=${fundId} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Funds', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Donation Funds', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipDonationTransaction_])
    async YourMembershipDonationTransactions_FundNameArray(@Root() yourmembershipdonationfund_: YourMembershipDonationFund_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donation Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationTransactions')} WHERE ${provider.QuoteIdentifier('FundName')}=${yourmembershipdonationfund_.fundId} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donation Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipDonationFund_)
    async CreateYourMembershipDonationFund(
        @Arg('input', () => CreateYourMembershipDonationFundInput) input: CreateYourMembershipDonationFundInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Donation Funds', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipDonationFund_)
    async UpdateYourMembershipDonationFund(
        @Arg('input', () => UpdateYourMembershipDonationFundInput) input: UpdateYourMembershipDonationFundInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Donation Funds', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipDonationFund_)
    async DeleteYourMembershipDonationFund(@Arg('fundId', () => Int) fundId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'fundId', Value: fundId}]);
        return this.DeleteRecord('Donation Funds', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Donation Histories
//****************************************************************************
@ObjectType({ description: `Individual donation records per member with amounts, funds, and payment methods` })
export class YourMembershipDonationHistory_ {
    @Field(() => Int) 
    intDonationId: number;
        
    @Field(() => Int, {nullable: true}) 
    ProfileID?: number;
        
    @Field({nullable: true}) 
    DatDonation?: Date;
        
    @Field(() => Float, {nullable: true}) 
    dblDonation?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    strStatus?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    strFundName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    strDonorName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    strPaymentMethod?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Donation Histories
//****************************************************************************
@InputType()
export class CreateYourMembershipDonationHistoryInput {
    @Field(() => Int, { nullable: true })
    intDonationId?: number;

    @Field(() => Int, { nullable: true })
    ProfileID: number | null;

    @Field({ nullable: true })
    DatDonation: Date | null;

    @Field(() => Float, { nullable: true })
    dblDonation: number | null;

    @Field({ nullable: true })
    strStatus: string | null;

    @Field({ nullable: true })
    strFundName: string | null;

    @Field({ nullable: true })
    strDonorName: string | null;

    @Field({ nullable: true })
    strPaymentMethod: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Donation Histories
//****************************************************************************
@InputType()
export class UpdateYourMembershipDonationHistoryInput {
    @Field(() => Int)
    intDonationId: number;

    @Field(() => Int, { nullable: true })
    ProfileID?: number | null;

    @Field({ nullable: true })
    DatDonation?: Date | null;

    @Field(() => Float, { nullable: true })
    dblDonation?: number | null;

    @Field({ nullable: true })
    strStatus?: string | null;

    @Field({ nullable: true })
    strFundName?: string | null;

    @Field({ nullable: true })
    strDonorName?: string | null;

    @Field({ nullable: true })
    strPaymentMethod?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Donation Histories
//****************************************************************************
@ObjectType()
export class RunYourMembershipDonationHistoryViewResult {
    @Field(() => [YourMembershipDonationHistory_])
    Results: YourMembershipDonationHistory_[];

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

@Resolver(YourMembershipDonationHistory_)
export class YourMembershipDonationHistoryResolver extends ResolverBase {
    @Query(() => RunYourMembershipDonationHistoryViewResult)
    async RunYourMembershipDonationHistoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDonationHistoryViewResult)
    async RunYourMembershipDonationHistoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDonationHistoryViewResult)
    async RunYourMembershipDonationHistoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Donation Histories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipDonationHistory_, { nullable: true })
    async YourMembershipDonationHistory(@Arg('intDonationId', () => Int) intDonationId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipDonationHistory_ | null> {
        this.CheckUserReadPermissions('Donation Histories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationHistories')} WHERE ${provider.QuoteIdentifier('intDonationId')}=${intDonationId} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Histories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Donation Histories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipDonationHistory_)
    async CreateYourMembershipDonationHistory(
        @Arg('input', () => CreateYourMembershipDonationHistoryInput) input: CreateYourMembershipDonationHistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Donation Histories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipDonationHistory_)
    async UpdateYourMembershipDonationHistory(
        @Arg('input', () => UpdateYourMembershipDonationHistoryInput) input: UpdateYourMembershipDonationHistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Donation Histories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipDonationHistory_)
    async DeleteYourMembershipDonationHistory(@Arg('intDonationId', () => Int) intDonationId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'intDonationId', Value: intDonationId}]);
        return this.DeleteRecord('Donation Histories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Donation Transactions
//****************************************************************************
@ObjectType({ description: `Donation payment transactions with member, fund, and payment details. DateFrom must be within 90 days.` })
export class YourMembershipDonationTransaction_ {
    @Field(() => Int) 
    TransactionID: number;
        
    @Field(() => Int, {nullable: true}) 
    WebsiteMemberID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ConstituentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field(() => Float, {nullable: true}) 
    Amount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FundName?: string;
        
    @Field({nullable: true}) 
    DateSubmitted?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentType?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipDonationHistory_])
    YourMembershipDonationHistories_intDonationIdArray: YourMembershipDonationHistory_[]; // Link to YourMembershipDonationHistories
    
}

//****************************************************************************
// INPUT TYPE for Donation Transactions
//****************************************************************************
@InputType()
export class CreateYourMembershipDonationTransactionInput {
    @Field(() => Int, { nullable: true })
    TransactionID?: number;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID: number | null;

    @Field({ nullable: true })
    ConstituentID: string | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field({ nullable: true })
    FundName: string | null;

    @Field({ nullable: true })
    DateSubmitted: Date | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    PaymentType: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Donation Transactions
//****************************************************************************
@InputType()
export class UpdateYourMembershipDonationTransactionInput {
    @Field(() => Int)
    TransactionID: number;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID?: number | null;

    @Field({ nullable: true })
    ConstituentID?: string | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field({ nullable: true })
    FundName?: string | null;

    @Field({ nullable: true })
    DateSubmitted?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    PaymentType?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Donation Transactions
//****************************************************************************
@ObjectType()
export class RunYourMembershipDonationTransactionViewResult {
    @Field(() => [YourMembershipDonationTransaction_])
    Results: YourMembershipDonationTransaction_[];

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

@Resolver(YourMembershipDonationTransaction_)
export class YourMembershipDonationTransactionResolver extends ResolverBase {
    @Query(() => RunYourMembershipDonationTransactionViewResult)
    async RunYourMembershipDonationTransactionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDonationTransactionViewResult)
    async RunYourMembershipDonationTransactionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDonationTransactionViewResult)
    async RunYourMembershipDonationTransactionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Donation Transactions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipDonationTransaction_, { nullable: true })
    async YourMembershipDonationTransaction(@Arg('TransactionID', () => Int) TransactionID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipDonationTransaction_ | null> {
        this.CheckUserReadPermissions('Donation Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationTransactions')} WHERE ${provider.QuoteIdentifier('TransactionID')}=${TransactionID} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Donation Transactions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipDonationHistory_])
    async YourMembershipDonationHistories_intDonationIdArray(@Root() yourmembershipdonationtransaction_: YourMembershipDonationTransaction_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donation Histories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationHistories')} WHERE ${provider.QuoteIdentifier('intDonationId')}=${yourmembershipdonationtransaction_.TransactionID} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Histories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donation Histories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipDonationTransaction_)
    async CreateYourMembershipDonationTransaction(
        @Arg('input', () => CreateYourMembershipDonationTransactionInput) input: CreateYourMembershipDonationTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Donation Transactions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipDonationTransaction_)
    async UpdateYourMembershipDonationTransaction(
        @Arg('input', () => UpdateYourMembershipDonationTransactionInput) input: UpdateYourMembershipDonationTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Donation Transactions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipDonationTransaction_)
    async DeleteYourMembershipDonationTransaction(@Arg('TransactionID', () => Int) TransactionID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'TransactionID', Value: TransactionID}]);
        return this.DeleteRecord('Donation Transactions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Dues Rules
//****************************************************************************
@ObjectType({ description: `Dues calculation rules with names, descriptions, and amount modifiers` })
export class YourMembershipDuesRule_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field(() => Float, {nullable: true}) 
    Amount?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    Selected?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Dues Rules
//****************************************************************************
@InputType()
export class CreateYourMembershipDuesRuleInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field(() => Boolean, { nullable: true })
    Selected: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Dues Rules
//****************************************************************************
@InputType()
export class UpdateYourMembershipDuesRuleInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field(() => Boolean, { nullable: true })
    Selected?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Dues Rules
//****************************************************************************
@ObjectType()
export class RunYourMembershipDuesRuleViewResult {
    @Field(() => [YourMembershipDuesRule_])
    Results: YourMembershipDuesRule_[];

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

@Resolver(YourMembershipDuesRule_)
export class YourMembershipDuesRuleResolver extends ResolverBase {
    @Query(() => RunYourMembershipDuesRuleViewResult)
    async RunYourMembershipDuesRuleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDuesRuleViewResult)
    async RunYourMembershipDuesRuleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDuesRuleViewResult)
    async RunYourMembershipDuesRuleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Dues Rules';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipDuesRule_, { nullable: true })
    async YourMembershipDuesRule(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipDuesRule_ | null> {
        this.CheckUserReadPermissions('Dues Rules', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesRules')} WHERE ${provider.QuoteIdentifier('ID')}=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Rules', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Dues Rules', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipDuesRule_)
    async CreateYourMembershipDuesRule(
        @Arg('input', () => CreateYourMembershipDuesRuleInput) input: CreateYourMembershipDuesRuleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Dues Rules', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipDuesRule_)
    async UpdateYourMembershipDuesRule(
        @Arg('input', () => UpdateYourMembershipDuesRuleInput) input: UpdateYourMembershipDuesRuleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Dues Rules', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipDuesRule_)
    async DeleteYourMembershipDuesRule(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Dues Rules', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Dues Transactions
//****************************************************************************
@ObjectType({ description: `Membership dues payment transactions with status, amounts, and membership details` })
export class YourMembershipDuesTransaction_ {
    @Field(() => Int) 
    TransactionID: number;
        
    @Field(() => Int, {nullable: true}) 
    InvoiceNumber?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field(() => Int, {nullable: true}) 
    WebsiteMemberID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ConstituentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Organization?: string;
        
    @Field(() => Float, {nullable: true}) 
    Amount?: number;
        
    @Field(() => Float, {nullable: true}) 
    BalanceDue?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentType?: string;
        
    @Field({nullable: true}) 
    DateSubmitted?: Date;
        
    @Field({nullable: true}) 
    DateProcessed?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MembershipRequested?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CurrentMembership?: string;
        
    @Field({nullable: true}) 
    CurrentMembershipExpDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MemberType?: string;
        
    @Field({nullable: true}) 
    DateMemberSignup?: Date;
        
    @Field({nullable: true}) 
    InvoiceDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ClosedBy?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Dues Transactions
//****************************************************************************
@InputType()
export class CreateYourMembershipDuesTransactionInput {
    @Field(() => Int, { nullable: true })
    TransactionID?: number;

    @Field(() => Int, { nullable: true })
    InvoiceNumber: number | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID: number | null;

    @Field({ nullable: true })
    ConstituentID: string | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field(() => Float, { nullable: true })
    BalanceDue: number | null;

    @Field({ nullable: true })
    PaymentType: string | null;

    @Field({ nullable: true })
    DateSubmitted: Date | null;

    @Field({ nullable: true })
    DateProcessed: Date | null;

    @Field({ nullable: true })
    MembershipRequested: string | null;

    @Field({ nullable: true })
    CurrentMembership: string | null;

    @Field({ nullable: true })
    CurrentMembershipExpDate: Date | null;

    @Field({ nullable: true })
    MemberType: string | null;

    @Field({ nullable: true })
    DateMemberSignup: Date | null;

    @Field({ nullable: true })
    InvoiceDate: Date | null;

    @Field({ nullable: true })
    ClosedBy: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Dues Transactions
//****************************************************************************
@InputType()
export class UpdateYourMembershipDuesTransactionInput {
    @Field(() => Int)
    TransactionID: number;

    @Field(() => Int, { nullable: true })
    InvoiceNumber?: number | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID?: number | null;

    @Field({ nullable: true })
    ConstituentID?: string | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field(() => Float, { nullable: true })
    BalanceDue?: number | null;

    @Field({ nullable: true })
    PaymentType?: string | null;

    @Field({ nullable: true })
    DateSubmitted?: Date | null;

    @Field({ nullable: true })
    DateProcessed?: Date | null;

    @Field({ nullable: true })
    MembershipRequested?: string | null;

    @Field({ nullable: true })
    CurrentMembership?: string | null;

    @Field({ nullable: true })
    CurrentMembershipExpDate?: Date | null;

    @Field({ nullable: true })
    MemberType?: string | null;

    @Field({ nullable: true })
    DateMemberSignup?: Date | null;

    @Field({ nullable: true })
    InvoiceDate?: Date | null;

    @Field({ nullable: true })
    ClosedBy?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Dues Transactions
//****************************************************************************
@ObjectType()
export class RunYourMembershipDuesTransactionViewResult {
    @Field(() => [YourMembershipDuesTransaction_])
    Results: YourMembershipDuesTransaction_[];

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

@Resolver(YourMembershipDuesTransaction_)
export class YourMembershipDuesTransactionResolver extends ResolverBase {
    @Query(() => RunYourMembershipDuesTransactionViewResult)
    async RunYourMembershipDuesTransactionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDuesTransactionViewResult)
    async RunYourMembershipDuesTransactionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipDuesTransactionViewResult)
    async RunYourMembershipDuesTransactionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Dues Transactions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipDuesTransaction_, { nullable: true })
    async YourMembershipDuesTransaction(@Arg('TransactionID', () => Int) TransactionID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipDuesTransaction_ | null> {
        this.CheckUserReadPermissions('Dues Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesTransactions')} WHERE ${provider.QuoteIdentifier('TransactionID')}=${TransactionID} ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Dues Transactions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipDuesTransaction_)
    async CreateYourMembershipDuesTransaction(
        @Arg('input', () => CreateYourMembershipDuesTransactionInput) input: CreateYourMembershipDuesTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Dues Transactions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipDuesTransaction_)
    async UpdateYourMembershipDuesTransaction(
        @Arg('input', () => UpdateYourMembershipDuesTransactionInput) input: UpdateYourMembershipDuesTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Dues Transactions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipDuesTransaction_)
    async DeleteYourMembershipDuesTransaction(@Arg('TransactionID', () => Int) TransactionID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'TransactionID', Value: TransactionID}]);
        return this.DeleteRecord('Dues Transactions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Suppression Lists
//****************************************************************************
@ObjectType({ description: `Email addresses suppressed from delivery with bounce counts and health rates` })
export class YourMembershipEmailSuppressionList_ {
    @Field() 
    @MaxLength(200)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    SuppressionType?: string;
        
    @Field(() => Int, {nullable: true}) 
    BounceCount?: number;
        
    @Field(() => Float, {nullable: true}) 
    HealthRate?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Suppression Lists
//****************************************************************************
@InputType()
export class CreateYourMembershipEmailSuppressionListInput {
    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    SuppressionType: string | null;

    @Field(() => Int, { nullable: true })
    BounceCount: number | null;

    @Field(() => Float, { nullable: true })
    HealthRate: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Email Suppression Lists
//****************************************************************************
@InputType()
export class UpdateYourMembershipEmailSuppressionListInput {
    @Field()
    Email: string;

    @Field({ nullable: true })
    SuppressionType?: string | null;

    @Field(() => Int, { nullable: true })
    BounceCount?: number | null;

    @Field(() => Float, { nullable: true })
    HealthRate?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Email Suppression Lists
//****************************************************************************
@ObjectType()
export class RunYourMembershipEmailSuppressionListViewResult {
    @Field(() => [YourMembershipEmailSuppressionList_])
    Results: YourMembershipEmailSuppressionList_[];

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

@Resolver(YourMembershipEmailSuppressionList_)
export class YourMembershipEmailSuppressionListResolver extends ResolverBase {
    @Query(() => RunYourMembershipEmailSuppressionListViewResult)
    async RunYourMembershipEmailSuppressionListViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEmailSuppressionListViewResult)
    async RunYourMembershipEmailSuppressionListViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEmailSuppressionListViewResult)
    async RunYourMembershipEmailSuppressionListDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Suppression Lists';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEmailSuppressionList_, { nullable: true })
    async YourMembershipEmailSuppressionList(@Arg('Email', () => String) Email: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEmailSuppressionList_ | null> {
        this.CheckUserReadPermissions('Email Suppression Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEmailSuppressionLists')} WHERE ${provider.QuoteIdentifier('Email')}='${Email}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Suppression Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Suppression Lists', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEmailSuppressionList_)
    async CreateYourMembershipEmailSuppressionList(
        @Arg('input', () => CreateYourMembershipEmailSuppressionListInput) input: CreateYourMembershipEmailSuppressionListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Suppression Lists', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEmailSuppressionList_)
    async UpdateYourMembershipEmailSuppressionList(
        @Arg('input', () => UpdateYourMembershipEmailSuppressionListInput) input: UpdateYourMembershipEmailSuppressionListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Suppression Lists', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEmailSuppressionList_)
    async DeleteYourMembershipEmailSuppressionList(@Arg('Email', () => String) Email: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Email', Value: Email}]);
        return this.DeleteRecord('Email Suppression Lists', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Emails
//****************************************************************************
@ObjectType({ description: `Logged email activities with sender, recipient, and content details` })
export class HubSpotEmail_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_subject?: string;
        
    @Field({nullable: true}) 
    hs_email_text?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    hs_email_html?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_direction?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_sender_email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_sender_firstname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_sender_lastname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_email_to_email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({nullable: true}) 
    hs_timestamp?: Date;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotCompanyEmail_])
    HubSpotCompanyEmails_email_idArray: HubSpotCompanyEmail_[]; // Link to HubSpotCompanyEmails
    
    @Field(() => [HubSpotDealEmail_])
    HubSpotDealEmails_email_idArray: HubSpotDealEmail_[]; // Link to HubSpotDealEmails
    
    @Field(() => [HubSpotTicketEmail_])
    HubSpotTicketEmails_email_idArray: HubSpotTicketEmail_[]; // Link to HubSpotTicketEmails
    
    @Field(() => [HubSpotContactEmail_])
    HubSpotContactEmails_email_idArray: HubSpotContactEmail_[]; // Link to HubSpotContactEmails
    
}

//****************************************************************************
// INPUT TYPE for Emails
//****************************************************************************
@InputType()
export class CreateHubSpotEmailInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_email_subject: string | null;

    @Field({ nullable: true })
    hs_email_text: string | null;

    @Field({ nullable: true })
    hs_email_html: string | null;

    @Field({ nullable: true })
    hs_email_status: string | null;

    @Field({ nullable: true })
    hs_email_direction: string | null;

    @Field({ nullable: true })
    hs_email_sender_email: string | null;

    @Field({ nullable: true })
    hs_email_sender_firstname: string | null;

    @Field({ nullable: true })
    hs_email_sender_lastname: string | null;

    @Field({ nullable: true })
    hs_email_to_email: string | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    hs_timestamp: Date | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Emails
//****************************************************************************
@InputType()
export class UpdateHubSpotEmailInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_email_subject?: string | null;

    @Field({ nullable: true })
    hs_email_text?: string | null;

    @Field({ nullable: true })
    hs_email_html?: string | null;

    @Field({ nullable: true })
    hs_email_status?: string | null;

    @Field({ nullable: true })
    hs_email_direction?: string | null;

    @Field({ nullable: true })
    hs_email_sender_email?: string | null;

    @Field({ nullable: true })
    hs_email_sender_firstname?: string | null;

    @Field({ nullable: true })
    hs_email_sender_lastname?: string | null;

    @Field({ nullable: true })
    hs_email_to_email?: string | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    hs_timestamp?: Date | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Emails
//****************************************************************************
@ObjectType()
export class RunHubSpotEmailViewResult {
    @Field(() => [HubSpotEmail_])
    Results: HubSpotEmail_[];

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

@Resolver(HubSpotEmail_)
export class HubSpotEmailResolver extends ResolverBase {
    @Query(() => RunHubSpotEmailViewResult)
    async RunHubSpotEmailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotEmailViewResult)
    async RunHubSpotEmailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotEmailViewResult)
    async RunHubSpotEmailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotEmail_, { nullable: true })
    async HubSpotEmail(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotEmail_ | null> {
        this.CheckUserReadPermissions('Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwEmails')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotCompanyEmail_])
    async HubSpotCompanyEmails_email_idArray(@Root() hubspotemail_: HubSpotEmail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyEmails')} WHERE ${provider.QuoteIdentifier('email_id')}='${hubspotemail_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealEmail_])
    async HubSpotDealEmails_email_idArray(@Root() hubspotemail_: HubSpotEmail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealEmails')} WHERE ${provider.QuoteIdentifier('email_id')}='${hubspotemail_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketEmail_])
    async HubSpotTicketEmails_email_idArray(@Root() hubspotemail_: HubSpotEmail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketEmails')} WHERE ${provider.QuoteIdentifier('email_id')}='${hubspotemail_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactEmail_])
    async HubSpotContactEmails_email_idArray(@Root() hubspotemail_: HubSpotEmail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactEmails')} WHERE ${provider.QuoteIdentifier('email_id')}='${hubspotemail_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotEmail_)
    async CreateHubSpotEmail(
        @Arg('input', () => CreateHubSpotEmailInput) input: CreateHubSpotEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotEmail_)
    async UpdateHubSpotEmail(
        @Arg('input', () => UpdateHubSpotEmailInput) input: UpdateHubSpotEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotEmail_)
    async DeleteHubSpotEmail(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Engagement Scores
//****************************************************************************
@ObjectType({ description: `Member engagement scoring metrics tracking participation and activity levels` })
export class YourMembershipEngagementScore_ {
    @Field(() => Int) 
    ProfileID: number;
        
    @Field(() => Float, {nullable: true}) 
    EngagementScore?: number;
        
    @Field({nullable: true}) 
    LastUpdated?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Engagement Scores
//****************************************************************************
@InputType()
export class CreateYourMembershipEngagementScoreInput {
    @Field(() => Int, { nullable: true })
    ProfileID?: number;

    @Field(() => Float, { nullable: true })
    EngagementScore: number | null;

    @Field({ nullable: true })
    LastUpdated: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Engagement Scores
//****************************************************************************
@InputType()
export class UpdateYourMembershipEngagementScoreInput {
    @Field(() => Int)
    ProfileID: number;

    @Field(() => Float, { nullable: true })
    EngagementScore?: number | null;

    @Field({ nullable: true })
    LastUpdated?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Engagement Scores
//****************************************************************************
@ObjectType()
export class RunYourMembershipEngagementScoreViewResult {
    @Field(() => [YourMembershipEngagementScore_])
    Results: YourMembershipEngagementScore_[];

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

@Resolver(YourMembershipEngagementScore_)
export class YourMembershipEngagementScoreResolver extends ResolverBase {
    @Query(() => RunYourMembershipEngagementScoreViewResult)
    async RunYourMembershipEngagementScoreViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEngagementScoreViewResult)
    async RunYourMembershipEngagementScoreViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEngagementScoreViewResult)
    async RunYourMembershipEngagementScoreDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Engagement Scores';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEngagementScore_, { nullable: true })
    async YourMembershipEngagementScore(@Arg('ProfileID', () => Int) ProfileID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEngagementScore_ | null> {
        this.CheckUserReadPermissions('Engagement Scores', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEngagementScores')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Engagement Scores', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Engagement Scores', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEngagementScore_)
    async CreateYourMembershipEngagementScore(
        @Arg('input', () => CreateYourMembershipEngagementScoreInput) input: CreateYourMembershipEngagementScoreInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Engagement Scores', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEngagementScore_)
    async UpdateYourMembershipEngagementScore(
        @Arg('input', () => UpdateYourMembershipEngagementScoreInput) input: UpdateYourMembershipEngagementScoreInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Engagement Scores', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEngagementScore_)
    async DeleteYourMembershipEngagementScore(@Arg('ProfileID', () => Int) ProfileID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ProfileID', Value: ProfileID}]);
        return this.DeleteRecord('Engagement Scores', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Attendee Types
//****************************************************************************
@ObjectType({ description: `Attendee type definitions per event (e.g., Member, Non-Member, Speaker)` })
export class YourMembershipEventAttendeeType_ {
    @Field(() => Int) 
    Id: number;
        
    @Field(() => Int, {nullable: true}) 
    EventId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Active?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event Attendee Types
//****************************************************************************
@InputType()
export class CreateYourMembershipEventAttendeeTypeInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field(() => Int, { nullable: true })
    EventId: number | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    Active: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Attendee Types
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventAttendeeTypeInput {
    @Field(() => Int)
    Id: number;

    @Field(() => Int, { nullable: true })
    EventId?: number | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    Active?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Attendee Types
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventAttendeeTypeViewResult {
    @Field(() => [YourMembershipEventAttendeeType_])
    Results: YourMembershipEventAttendeeType_[];

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

@Resolver(YourMembershipEventAttendeeType_)
export class YourMembershipEventAttendeeTypeResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventAttendeeTypeViewResult)
    async RunYourMembershipEventAttendeeTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventAttendeeTypeViewResult)
    async RunYourMembershipEventAttendeeTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventAttendeeTypeViewResult)
    async RunYourMembershipEventAttendeeTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Attendee Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventAttendeeType_, { nullable: true })
    async YourMembershipEventAttendeeType(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventAttendeeType_ | null> {
        this.CheckUserReadPermissions('Event Attendee Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventAttendeeTypes')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Attendee Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Attendee Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventAttendeeType_)
    async CreateYourMembershipEventAttendeeType(
        @Arg('input', () => CreateYourMembershipEventAttendeeTypeInput) input: CreateYourMembershipEventAttendeeTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Attendee Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventAttendeeType_)
    async UpdateYourMembershipEventAttendeeType(
        @Arg('input', () => UpdateYourMembershipEventAttendeeTypeInput) input: UpdateYourMembershipEventAttendeeTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Attendee Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventAttendeeType_)
    async DeleteYourMembershipEventAttendeeType(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Event Attendee Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Categories
//****************************************************************************
@ObjectType({ description: `Categories for organizing and classifying events` })
export class YourMembershipEventCategory_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipEventTicket_])
    YourMembershipEventTickets_CategoryArray: YourMembershipEventTicket_[]; // Link to YourMembershipEventTickets
    
}

//****************************************************************************
// INPUT TYPE for Event Categories
//****************************************************************************
@InputType()
export class CreateYourMembershipEventCategoryInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Categories
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventCategoryInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Categories
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventCategoryViewResult {
    @Field(() => [YourMembershipEventCategory_])
    Results: YourMembershipEventCategory_[];

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

@Resolver(YourMembershipEventCategory_)
export class YourMembershipEventCategoryResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventCategoryViewResult)
    async RunYourMembershipEventCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventCategoryViewResult)
    async RunYourMembershipEventCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventCategoryViewResult)
    async RunYourMembershipEventCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventCategory_, { nullable: true })
    async YourMembershipEventCategory(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventCategory_ | null> {
        this.CheckUserReadPermissions('Event Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventCategories')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipEventTicket_])
    async YourMembershipEventTickets_CategoryArray(@Root() yourmembershipeventcategory_: YourMembershipEventCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventTickets')} WHERE ${provider.QuoteIdentifier('Category')}=${yourmembershipeventcategory_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipEventCategory_)
    async CreateYourMembershipEventCategory(
        @Arg('input', () => CreateYourMembershipEventCategoryInput) input: CreateYourMembershipEventCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventCategory_)
    async UpdateYourMembershipEventCategory(
        @Arg('input', () => UpdateYourMembershipEventCategoryInput) input: UpdateYourMembershipEventCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventCategory_)
    async DeleteYourMembershipEventCategory(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Event Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event CEU Awards
//****************************************************************************
@ObjectType({ description: `Continuing education credit awards linked to events and certifications` })
export class YourMembershipEventCEUAward_ {
    @Field(() => Int) 
    AwardID: number;
        
    @Field(() => Int, {nullable: true}) 
    EventId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CertificationID?: string;
        
    @Field(() => Int, {nullable: true}) 
    CreditTypeID?: number;
        
    @Field(() => Float, {nullable: true}) 
    Credits?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event CEU Awards
//****************************************************************************
@InputType()
export class CreateYourMembershipEventCEUAwardInput {
    @Field(() => Int, { nullable: true })
    AwardID?: number;

    @Field(() => Int, { nullable: true })
    EventId: number | null;

    @Field({ nullable: true })
    CertificationID: string | null;

    @Field(() => Int, { nullable: true })
    CreditTypeID: number | null;

    @Field(() => Float, { nullable: true })
    Credits: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event CEU Awards
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventCEUAwardInput {
    @Field(() => Int)
    AwardID: number;

    @Field(() => Int, { nullable: true })
    EventId?: number | null;

    @Field({ nullable: true })
    CertificationID?: string | null;

    @Field(() => Int, { nullable: true })
    CreditTypeID?: number | null;

    @Field(() => Float, { nullable: true })
    Credits?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event CEU Awards
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventCEUAwardViewResult {
    @Field(() => [YourMembershipEventCEUAward_])
    Results: YourMembershipEventCEUAward_[];

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

@Resolver(YourMembershipEventCEUAward_)
export class YourMembershipEventCEUAwardResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventCEUAwardViewResult)
    async RunYourMembershipEventCEUAwardViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventCEUAwardViewResult)
    async RunYourMembershipEventCEUAwardViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventCEUAwardViewResult)
    async RunYourMembershipEventCEUAwardDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event CEU Awards';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventCEUAward_, { nullable: true })
    async YourMembershipEventCEUAward(@Arg('AwardID', () => Int) AwardID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventCEUAward_ | null> {
        this.CheckUserReadPermissions('Event CEU Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventCEUAwards')} WHERE ${provider.QuoteIdentifier('AwardID')}=${AwardID} ` + this.getRowLevelSecurityWhereClause(provider, 'Event CEU Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event CEU Awards', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventCEUAward_)
    async CreateYourMembershipEventCEUAward(
        @Arg('input', () => CreateYourMembershipEventCEUAwardInput) input: CreateYourMembershipEventCEUAwardInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event CEU Awards', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventCEUAward_)
    async UpdateYourMembershipEventCEUAward(
        @Arg('input', () => UpdateYourMembershipEventCEUAwardInput) input: UpdateYourMembershipEventCEUAwardInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event CEU Awards', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventCEUAward_)
    async DeleteYourMembershipEventCEUAward(@Arg('AwardID', () => Int) AwardID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'AwardID', Value: AwardID}]);
        return this.DeleteRecord('Event CEU Awards', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event IDs
//****************************************************************************
@ObjectType({ description: `Lightweight event identifier list for sync with last-modified date filtering` })
export class YourMembershipEventID_ {
    @Field(() => Int) 
    EventId: number;
        
    @Field({nullable: true}) 
    LastModifiedDate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event IDs
//****************************************************************************
@InputType()
export class CreateYourMembershipEventIDInput {
    @Field(() => Int, { nullable: true })
    EventId?: number;

    @Field({ nullable: true })
    LastModifiedDate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event IDs
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventIDInput {
    @Field(() => Int)
    EventId: number;

    @Field({ nullable: true })
    LastModifiedDate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event IDs
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventIDViewResult {
    @Field(() => [YourMembershipEventID_])
    Results: YourMembershipEventID_[];

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

@Resolver(YourMembershipEventID_)
export class YourMembershipEventIDResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventIDViewResult)
    async RunYourMembershipEventIDViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventIDViewResult)
    async RunYourMembershipEventIDViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventIDViewResult)
    async RunYourMembershipEventIDDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event IDs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventID_, { nullable: true })
    async YourMembershipEventID(@Arg('EventId', () => Int) EventId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventID_ | null> {
        this.CheckUserReadPermissions('Event IDs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventIDs')} WHERE ${provider.QuoteIdentifier('EventId')}=${EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event IDs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event IDs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventID_)
    async CreateYourMembershipEventID(
        @Arg('input', () => CreateYourMembershipEventIDInput) input: CreateYourMembershipEventIDInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event IDs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventID_)
    async UpdateYourMembershipEventID(
        @Arg('input', () => UpdateYourMembershipEventIDInput) input: UpdateYourMembershipEventIDInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event IDs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventID_)
    async DeleteYourMembershipEventID(@Arg('EventId', () => Int) EventId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'EventId', Value: EventId}]);
        return this.DeleteRecord('Event IDs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Registration Forms
//****************************************************************************
@ObjectType({ description: `Registration form definitions for events with auto-approval settings` })
export class YourMembershipEventRegistrationForm_ {
    @Field(() => Int) 
    FormId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FormName?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    AutoApprove?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event Registration Forms
//****************************************************************************
@InputType()
export class CreateYourMembershipEventRegistrationFormInput {
    @Field(() => Int, { nullable: true })
    FormId?: number;

    @Field({ nullable: true })
    FormName: string | null;

    @Field(() => Boolean, { nullable: true })
    AutoApprove: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Registration Forms
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventRegistrationFormInput {
    @Field(() => Int)
    FormId: number;

    @Field({ nullable: true })
    FormName?: string | null;

    @Field(() => Boolean, { nullable: true })
    AutoApprove?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Registration Forms
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventRegistrationFormViewResult {
    @Field(() => [YourMembershipEventRegistrationForm_])
    Results: YourMembershipEventRegistrationForm_[];

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

@Resolver(YourMembershipEventRegistrationForm_)
export class YourMembershipEventRegistrationFormResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventRegistrationFormViewResult)
    async RunYourMembershipEventRegistrationFormViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventRegistrationFormViewResult)
    async RunYourMembershipEventRegistrationFormViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventRegistrationFormViewResult)
    async RunYourMembershipEventRegistrationFormDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Registration Forms';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventRegistrationForm_, { nullable: true })
    async YourMembershipEventRegistrationForm(@Arg('FormId', () => Int) FormId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventRegistrationForm_ | null> {
        this.CheckUserReadPermissions('Event Registration Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventRegistrationForms')} WHERE ${provider.QuoteIdentifier('FormId')}=${FormId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registration Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Registration Forms', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventRegistrationForm_)
    async CreateYourMembershipEventRegistrationForm(
        @Arg('input', () => CreateYourMembershipEventRegistrationFormInput) input: CreateYourMembershipEventRegistrationFormInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Registration Forms', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventRegistrationForm_)
    async UpdateYourMembershipEventRegistrationForm(
        @Arg('input', () => UpdateYourMembershipEventRegistrationFormInput) input: UpdateYourMembershipEventRegistrationFormInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Registration Forms', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventRegistrationForm_)
    async DeleteYourMembershipEventRegistrationForm(@Arg('FormId', () => Int) FormId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'FormId', Value: FormId}]);
        return this.DeleteRecord('Event Registration Forms', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Registrations
//****************************************************************************
@ObjectType({ description: `Event registration records with attendee details, status, badge numbers, and attendance tracking` })
export class YourMembershipEventRegistration_ {
    @Field(() => Int) 
    Id: number;
        
    @Field(() => Int, {nullable: true}) 
    EventId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    RegistrationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DisplayName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    HeadShotImage?: string;
        
    @Field({nullable: true}) 
    DateRegistered?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPrimary?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    BadgeNumber?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event Registrations
//****************************************************************************
@InputType()
export class CreateYourMembershipEventRegistrationInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field(() => Int, { nullable: true })
    EventId: number | null;

    @Field({ nullable: true })
    RegistrationID: string | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    DisplayName: string | null;

    @Field({ nullable: true })
    HeadShotImage: string | null;

    @Field({ nullable: true })
    DateRegistered: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary: boolean | null;

    @Field(() => Int, { nullable: true })
    BadgeNumber: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Registrations
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventRegistrationInput {
    @Field(() => Int)
    Id: number;

    @Field(() => Int, { nullable: true })
    EventId?: number | null;

    @Field({ nullable: true })
    RegistrationID?: string | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    DisplayName?: string | null;

    @Field({ nullable: true })
    HeadShotImage?: string | null;

    @Field({ nullable: true })
    DateRegistered?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean | null;

    @Field(() => Int, { nullable: true })
    BadgeNumber?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Registrations
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventRegistrationViewResult {
    @Field(() => [YourMembershipEventRegistration_])
    Results: YourMembershipEventRegistration_[];

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

@Resolver(YourMembershipEventRegistration_)
export class YourMembershipEventRegistrationResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventRegistrationViewResult)
    async RunYourMembershipEventRegistrationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventRegistrationViewResult)
    async RunYourMembershipEventRegistrationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventRegistrationViewResult)
    async RunYourMembershipEventRegistrationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Registrations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventRegistration_, { nullable: true })
    async YourMembershipEventRegistration(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventRegistration_ | null> {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Registrations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventRegistration_)
    async CreateYourMembershipEventRegistration(
        @Arg('input', () => CreateYourMembershipEventRegistrationInput) input: CreateYourMembershipEventRegistrationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Registrations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventRegistration_)
    async UpdateYourMembershipEventRegistration(
        @Arg('input', () => UpdateYourMembershipEventRegistrationInput) input: UpdateYourMembershipEventRegistrationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Registrations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventRegistration_)
    async DeleteYourMembershipEventRegistration(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Event Registrations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Session Groups
//****************************************************************************
@ObjectType({ description: `Logical groupings of sessions within events (e.g., tracks, time slots)` })
export class YourMembershipEventSessionGroup_ {
    @Field(() => Int) 
    SessionGroupId: number;
        
    @Field(() => Int, {nullable: true}) 
    EventId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event Session Groups
//****************************************************************************
@InputType()
export class CreateYourMembershipEventSessionGroupInput {
    @Field(() => Int, { nullable: true })
    SessionGroupId?: number;

    @Field(() => Int, { nullable: true })
    EventId: number | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Session Groups
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventSessionGroupInput {
    @Field(() => Int)
    SessionGroupId: number;

    @Field(() => Int, { nullable: true })
    EventId?: number | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Session Groups
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventSessionGroupViewResult {
    @Field(() => [YourMembershipEventSessionGroup_])
    Results: YourMembershipEventSessionGroup_[];

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

@Resolver(YourMembershipEventSessionGroup_)
export class YourMembershipEventSessionGroupResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventSessionGroupViewResult)
    async RunYourMembershipEventSessionGroupViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventSessionGroupViewResult)
    async RunYourMembershipEventSessionGroupViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventSessionGroupViewResult)
    async RunYourMembershipEventSessionGroupDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Session Groups';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventSessionGroup_, { nullable: true })
    async YourMembershipEventSessionGroup(@Arg('SessionGroupId', () => Int) SessionGroupId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventSessionGroup_ | null> {
        this.CheckUserReadPermissions('Event Session Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventSessionGroups')} WHERE ${provider.QuoteIdentifier('SessionGroupId')}=${SessionGroupId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Session Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Session Groups', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventSessionGroup_)
    async CreateYourMembershipEventSessionGroup(
        @Arg('input', () => CreateYourMembershipEventSessionGroupInput) input: CreateYourMembershipEventSessionGroupInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Session Groups', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventSessionGroup_)
    async UpdateYourMembershipEventSessionGroup(
        @Arg('input', () => UpdateYourMembershipEventSessionGroupInput) input: UpdateYourMembershipEventSessionGroupInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Session Groups', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventSessionGroup_)
    async DeleteYourMembershipEventSessionGroup(@Arg('SessionGroupId', () => Int) SessionGroupId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'SessionGroupId', Value: SessionGroupId}]);
        return this.DeleteRecord('Event Session Groups', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Sessions
//****************************************************************************
@ObjectType({ description: `Breakout sessions within events including presenter, schedule, and CEU eligibility` })
export class YourMembershipEventSession_ {
    @Field(() => Int) 
    SessionId: number;
        
    @Field(() => Int, {nullable: true}) 
    EventId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Presenter?: string;
        
    @Field({nullable: true}) 
    StartDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    StartTime?: string;
        
    @Field({nullable: true}) 
    EndDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EndTime?: string;
        
    @Field(() => Int, {nullable: true}) 
    MaxRegistrants?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    AllowCEUs?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event Sessions
//****************************************************************************
@InputType()
export class CreateYourMembershipEventSessionInput {
    @Field(() => Int, { nullable: true })
    SessionId?: number;

    @Field(() => Int, { nullable: true })
    EventId: number | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Presenter: string | null;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    StartTime: string | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    EndTime: string | null;

    @Field(() => Int, { nullable: true })
    MaxRegistrants: number | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    AllowCEUs: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Sessions
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventSessionInput {
    @Field(() => Int)
    SessionId: number;

    @Field(() => Int, { nullable: true })
    EventId?: number | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Presenter?: string | null;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    StartTime?: string | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    EndTime?: string | null;

    @Field(() => Int, { nullable: true })
    MaxRegistrants?: number | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    AllowCEUs?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Sessions
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventSessionViewResult {
    @Field(() => [YourMembershipEventSession_])
    Results: YourMembershipEventSession_[];

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

@Resolver(YourMembershipEventSession_)
export class YourMembershipEventSessionResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventSessionViewResult)
    async RunYourMembershipEventSessionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventSessionViewResult)
    async RunYourMembershipEventSessionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventSessionViewResult)
    async RunYourMembershipEventSessionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Sessions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventSession_, { nullable: true })
    async YourMembershipEventSession(@Arg('SessionId', () => Int) SessionId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventSession_ | null> {
        this.CheckUserReadPermissions('Event Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventSessions')} WHERE ${provider.QuoteIdentifier('SessionId')}=${SessionId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Sessions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventSession_)
    async CreateYourMembershipEventSession(
        @Arg('input', () => CreateYourMembershipEventSessionInput) input: CreateYourMembershipEventSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Sessions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventSession_)
    async UpdateYourMembershipEventSession(
        @Arg('input', () => UpdateYourMembershipEventSessionInput) input: UpdateYourMembershipEventSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Sessions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventSession_)
    async DeleteYourMembershipEventSession(@Arg('SessionId', () => Int) SessionId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'SessionId', Value: SessionId}]);
        return this.DeleteRecord('Event Sessions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Tickets
//****************************************************************************
@ObjectType({ description: `Ticket types for events with pricing, quantity limits, and categories` })
export class YourMembershipEventTicket_ {
    @Field(() => Int) 
    TicketId: number;
        
    @Field(() => Int, {nullable: true}) 
    EventId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Int, {nullable: true}) 
    Quantity?: number;
        
    @Field(() => Float, {nullable: true}) 
    UnitPrice?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Type?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Active?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Event Tickets
//****************************************************************************
@InputType()
export class CreateYourMembershipEventTicketInput {
    @Field(() => Int, { nullable: true })
    TicketId?: number;

    @Field(() => Int, { nullable: true })
    EventId: number | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Int, { nullable: true })
    Quantity: number | null;

    @Field(() => Float, { nullable: true })
    UnitPrice: number | null;

    @Field({ nullable: true })
    Type: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Boolean, { nullable: true })
    Active: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Tickets
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventTicketInput {
    @Field(() => Int)
    TicketId: number;

    @Field(() => Int, { nullable: true })
    EventId?: number | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Int, { nullable: true })
    Quantity?: number | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number | null;

    @Field({ nullable: true })
    Type?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Boolean, { nullable: true })
    Active?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Tickets
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventTicketViewResult {
    @Field(() => [YourMembershipEventTicket_])
    Results: YourMembershipEventTicket_[];

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

@Resolver(YourMembershipEventTicket_)
export class YourMembershipEventTicketResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventTicketViewResult)
    async RunYourMembershipEventTicketViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventTicketViewResult)
    async RunYourMembershipEventTicketViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventTicketViewResult)
    async RunYourMembershipEventTicketDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Tickets';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEventTicket_, { nullable: true })
    async YourMembershipEventTicket(@Arg('TicketId', () => Int) TicketId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEventTicket_ | null> {
        this.CheckUserReadPermissions('Event Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventTickets')} WHERE ${provider.QuoteIdentifier('TicketId')}=${TicketId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Tickets', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipEventTicket_)
    async CreateYourMembershipEventTicket(
        @Arg('input', () => CreateYourMembershipEventTicketInput) input: CreateYourMembershipEventTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Tickets', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEventTicket_)
    async UpdateYourMembershipEventTicket(
        @Arg('input', () => UpdateYourMembershipEventTicketInput) input: UpdateYourMembershipEventTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Tickets', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEventTicket_)
    async DeleteYourMembershipEventTicket(@Arg('TicketId', () => Int) TicketId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'TicketId', Value: TicketId}]);
        return this.DeleteRecord('Event Tickets', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType({ description: `Events including conferences, webinars, and meetings with dates and virtual meeting info` })
export class YourMembershipEvent_ {
    @Field(() => Int) 
    EventId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Active?: boolean;
        
    @Field({nullable: true}) 
    StartDate?: Date;
        
    @Field({nullable: true}) 
    EndDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    StartTime?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EndTime?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsVirtual?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    VirtualMeetingType?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipEventRegistration_])
    YourMembershipEventRegistrations_EventIdArray: YourMembershipEventRegistration_[]; // Link to YourMembershipEventRegistrations
    
    @Field(() => [YourMembershipEventTicket_])
    YourMembershipEventTickets_EventIdArray: YourMembershipEventTicket_[]; // Link to YourMembershipEventTickets
    
    @Field(() => [YourMembershipEventID_])
    YourMembershipEventIDs_EventIdArray: YourMembershipEventID_[]; // Link to YourMembershipEventIDs
    
    @Field(() => [YourMembershipEventSession_])
    YourMembershipEventSessions_EventIdArray: YourMembershipEventSession_[]; // Link to YourMembershipEventSessions
    
    @Field(() => [YourMembershipEventAttendeeType_])
    YourMembershipEventAttendeeTypes_EventIdArray: YourMembershipEventAttendeeType_[]; // Link to YourMembershipEventAttendeeTypes
    
    @Field(() => [YourMembershipEventSessionGroup_])
    YourMembershipEventSessionGroups_EventIdArray: YourMembershipEventSessionGroup_[]; // Link to YourMembershipEventSessionGroups
    
    @Field(() => [YourMembershipEventCEUAward_])
    YourMembershipEventCEUAwards_EventIdArray: YourMembershipEventCEUAward_[]; // Link to YourMembershipEventCEUAwards
    
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreateYourMembershipEventInput {
    @Field(() => Int, { nullable: true })
    EventId?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Boolean, { nullable: true })
    Active: boolean | null;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    StartTime: string | null;

    @Field({ nullable: true })
    EndTime: string | null;

    @Field(() => Boolean, { nullable: true })
    IsVirtual: boolean | null;

    @Field({ nullable: true })
    VirtualMeetingType: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdateYourMembershipEventInput {
    @Field(() => Int)
    EventId: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Boolean, { nullable: true })
    Active?: boolean | null;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    StartTime?: string | null;

    @Field({ nullable: true })
    EndTime?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsVirtual?: boolean | null;

    @Field({ nullable: true })
    VirtualMeetingType?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunYourMembershipEventViewResult {
    @Field(() => [YourMembershipEvent_])
    Results: YourMembershipEvent_[];

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

@Resolver(YourMembershipEvent_)
export class YourMembershipEventResolver extends ResolverBase {
    @Query(() => RunYourMembershipEventViewResult)
    async RunYourMembershipEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventViewResult)
    async RunYourMembershipEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipEventViewResult)
    async RunYourMembershipEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipEvent_, { nullable: true })
    async YourMembershipEvent(@Arg('EventId', () => Int) EventId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipEvent_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEvents')} WHERE ${provider.QuoteIdentifier('EventId')}=${EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipEventRegistration_])
    async YourMembershipEventRegistrations_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventTicket_])
    async YourMembershipEventTickets_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventTickets')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventID_])
    async YourMembershipEventIDs_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event IDs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventIDs')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event IDs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event IDs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventSession_])
    async YourMembershipEventSessions_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventSessions')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Sessions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventAttendeeType_])
    async YourMembershipEventAttendeeTypes_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Attendee Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventAttendeeTypes')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Attendee Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Attendee Types', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventSessionGroup_])
    async YourMembershipEventSessionGroups_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Session Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventSessionGroups')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Session Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Session Groups', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEventCEUAward_])
    async YourMembershipEventCEUAwards_EventIdArray(@Root() yourmembershipevent_: YourMembershipEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event CEU Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEventCEUAwards')} WHERE ${provider.QuoteIdentifier('EventId')}=${yourmembershipevent_.EventId} ` + this.getRowLevelSecurityWhereClause(provider, 'Event CEU Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event CEU Awards', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipEvent_)
    async CreateYourMembershipEvent(
        @Arg('input', () => CreateYourMembershipEventInput) input: CreateYourMembershipEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipEvent_)
    async UpdateYourMembershipEvent(
        @Arg('input', () => UpdateYourMembershipEventInput) input: UpdateYourMembershipEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipEvent_)
    async DeleteYourMembershipEvent(@Arg('EventId', () => Int) EventId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'EventId', Value: EventId}]);
        return this.DeleteRecord('Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Feedback Submissions
//****************************************************************************
@ObjectType({ description: `Customer feedback survey responses with sentiment and channel data` })
export class HubSpotFeedbackSubmission_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hs_survey_id?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_survey_name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_survey_type?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_submission_name?: string;
        
    @Field({nullable: true}) 
    hs_content?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_response_group?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sentiment?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_survey_channel?: string;
        
    @Field({nullable: true}) 
    hs_timestamp?: Date;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotContactFeedbackSubmission_])
    HubSpotContactFeedbackSubmissions_feedback_submission_idArray: HubSpotContactFeedbackSubmission_[]; // Link to HubSpotContactFeedbackSubmissions
    
    @Field(() => [HubSpotTicketFeedbackSubmission_])
    HubSpotTicketFeedbackSubmissions_feedback_submission_idArray: HubSpotTicketFeedbackSubmission_[]; // Link to HubSpotTicketFeedbackSubmissions
    
}

//****************************************************************************
// INPUT TYPE for Feedback Submissions
//****************************************************************************
@InputType()
export class CreateHubSpotFeedbackSubmissionInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_survey_id: string | null;

    @Field({ nullable: true })
    hs_survey_name: string | null;

    @Field({ nullable: true })
    hs_survey_type: string | null;

    @Field({ nullable: true })
    hs_submission_name: string | null;

    @Field({ nullable: true })
    hs_content: string | null;

    @Field({ nullable: true })
    hs_response_group: string | null;

    @Field({ nullable: true })
    hs_sentiment: string | null;

    @Field({ nullable: true })
    hs_survey_channel: string | null;

    @Field({ nullable: true })
    hs_timestamp: Date | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Feedback Submissions
//****************************************************************************
@InputType()
export class UpdateHubSpotFeedbackSubmissionInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_survey_id?: string | null;

    @Field({ nullable: true })
    hs_survey_name?: string | null;

    @Field({ nullable: true })
    hs_survey_type?: string | null;

    @Field({ nullable: true })
    hs_submission_name?: string | null;

    @Field({ nullable: true })
    hs_content?: string | null;

    @Field({ nullable: true })
    hs_response_group?: string | null;

    @Field({ nullable: true })
    hs_sentiment?: string | null;

    @Field({ nullable: true })
    hs_survey_channel?: string | null;

    @Field({ nullable: true })
    hs_timestamp?: Date | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Feedback Submissions
//****************************************************************************
@ObjectType()
export class RunHubSpotFeedbackSubmissionViewResult {
    @Field(() => [HubSpotFeedbackSubmission_])
    Results: HubSpotFeedbackSubmission_[];

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

@Resolver(HubSpotFeedbackSubmission_)
export class HubSpotFeedbackSubmissionResolver extends ResolverBase {
    @Query(() => RunHubSpotFeedbackSubmissionViewResult)
    async RunHubSpotFeedbackSubmissionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotFeedbackSubmissionViewResult)
    async RunHubSpotFeedbackSubmissionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotFeedbackSubmissionViewResult)
    async RunHubSpotFeedbackSubmissionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Feedback Submissions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotFeedbackSubmission_, { nullable: true })
    async HubSpotFeedbackSubmission(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotFeedbackSubmission_ | null> {
        this.CheckUserReadPermissions('Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Feedback Submissions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotContactFeedbackSubmission_])
    async HubSpotContactFeedbackSubmissions_feedback_submission_idArray(@Root() hubspotfeedbacksubmission_: HubSpotFeedbackSubmission_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('feedback_submission_id')}='${hubspotfeedbacksubmission_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Feedback Submissions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketFeedbackSubmission_])
    async HubSpotTicketFeedbackSubmissions_feedback_submission_idArray(@Root() hubspotfeedbacksubmission_: HubSpotFeedbackSubmission_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('feedback_submission_id')}='${hubspotfeedbacksubmission_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Feedback Submissions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotFeedbackSubmission_)
    async CreateHubSpotFeedbackSubmission(
        @Arg('input', () => CreateHubSpotFeedbackSubmissionInput) input: CreateHubSpotFeedbackSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Feedback Submissions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotFeedbackSubmission_)
    async UpdateHubSpotFeedbackSubmission(
        @Arg('input', () => UpdateHubSpotFeedbackSubmissionInput) input: UpdateHubSpotFeedbackSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Feedback Submissions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotFeedbackSubmission_)
    async DeleteHubSpotFeedbackSubmission(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Feedback Submissions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Finance Batch Details
//****************************************************************************
@ObjectType({ description: `Detailed invoice and payment records within financial processing batches` })
export class YourMembershipFinanceBatchDetail_ {
    @Field(() => Int) 
    DetailID: number;
        
    @Field(() => Int, {nullable: true}) 
    BatchID?: number;
        
    @Field(() => Int, {nullable: true}) 
    InvoiceNumber?: number;
        
    @Field(() => Float, {nullable: true}) 
    Amount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentType?: string;
        
    @Field({nullable: true}) 
    TransactionDate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Finance Batch Details
//****************************************************************************
@InputType()
export class CreateYourMembershipFinanceBatchDetailInput {
    @Field(() => Int, { nullable: true })
    DetailID?: number;

    @Field(() => Int, { nullable: true })
    BatchID: number | null;

    @Field(() => Int, { nullable: true })
    InvoiceNumber: number | null;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field({ nullable: true })
    PaymentType: string | null;

    @Field({ nullable: true })
    TransactionDate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Finance Batch Details
//****************************************************************************
@InputType()
export class UpdateYourMembershipFinanceBatchDetailInput {
    @Field(() => Int)
    DetailID: number;

    @Field(() => Int, { nullable: true })
    BatchID?: number | null;

    @Field(() => Int, { nullable: true })
    InvoiceNumber?: number | null;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field({ nullable: true })
    PaymentType?: string | null;

    @Field({ nullable: true })
    TransactionDate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Finance Batch Details
//****************************************************************************
@ObjectType()
export class RunYourMembershipFinanceBatchDetailViewResult {
    @Field(() => [YourMembershipFinanceBatchDetail_])
    Results: YourMembershipFinanceBatchDetail_[];

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

@Resolver(YourMembershipFinanceBatchDetail_)
export class YourMembershipFinanceBatchDetailResolver extends ResolverBase {
    @Query(() => RunYourMembershipFinanceBatchDetailViewResult)
    async RunYourMembershipFinanceBatchDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipFinanceBatchDetailViewResult)
    async RunYourMembershipFinanceBatchDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipFinanceBatchDetailViewResult)
    async RunYourMembershipFinanceBatchDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Finance Batch Details';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipFinanceBatchDetail_, { nullable: true })
    async YourMembershipFinanceBatchDetail(@Arg('DetailID', () => Int) DetailID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipFinanceBatchDetail_ | null> {
        this.CheckUserReadPermissions('Finance Batch Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwFinanceBatchDetails')} WHERE ${provider.QuoteIdentifier('DetailID')}=${DetailID} ` + this.getRowLevelSecurityWhereClause(provider, 'Finance Batch Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Finance Batch Details', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipFinanceBatchDetail_)
    async CreateYourMembershipFinanceBatchDetail(
        @Arg('input', () => CreateYourMembershipFinanceBatchDetailInput) input: CreateYourMembershipFinanceBatchDetailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Finance Batch Details', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipFinanceBatchDetail_)
    async UpdateYourMembershipFinanceBatchDetail(
        @Arg('input', () => UpdateYourMembershipFinanceBatchDetailInput) input: UpdateYourMembershipFinanceBatchDetailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Finance Batch Details', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipFinanceBatchDetail_)
    async DeleteYourMembershipFinanceBatchDetail(@Arg('DetailID', () => Int) DetailID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'DetailID', Value: DetailID}]);
        return this.DeleteRecord('Finance Batch Details', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Finance Batches
//****************************************************************************
@ObjectType({ description: `Financial processing batches grouping transactions by commerce type and close date. DISABLED: YM API pagination is broken for this endpoint — returns the same full result set on every page regardless of PageNumber, causing infinite loops.` })
export class YourMembershipFinanceBatch_ {
    @Field(() => Int) 
    BatchID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CommerceType?: string;
        
    @Field(() => Int, {nullable: true}) 
    ItemCount?: number;
        
    @Field({nullable: true}) 
    ClosedDate?: Date;
        
    @Field({nullable: true}) 
    CreateDateTime?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipFinanceBatchDetail_])
    YourMembershipFinanceBatchDetails_BatchIDArray: YourMembershipFinanceBatchDetail_[]; // Link to YourMembershipFinanceBatchDetails
    
}

//****************************************************************************
// INPUT TYPE for Finance Batches
//****************************************************************************
@InputType()
export class CreateYourMembershipFinanceBatchInput {
    @Field(() => Int, { nullable: true })
    BatchID?: number;

    @Field({ nullable: true })
    CommerceType: string | null;

    @Field(() => Int, { nullable: true })
    ItemCount: number | null;

    @Field({ nullable: true })
    ClosedDate: Date | null;

    @Field({ nullable: true })
    CreateDateTime: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Finance Batches
//****************************************************************************
@InputType()
export class UpdateYourMembershipFinanceBatchInput {
    @Field(() => Int)
    BatchID: number;

    @Field({ nullable: true })
    CommerceType?: string | null;

    @Field(() => Int, { nullable: true })
    ItemCount?: number | null;

    @Field({ nullable: true })
    ClosedDate?: Date | null;

    @Field({ nullable: true })
    CreateDateTime?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Finance Batches
//****************************************************************************
@ObjectType()
export class RunYourMembershipFinanceBatchViewResult {
    @Field(() => [YourMembershipFinanceBatch_])
    Results: YourMembershipFinanceBatch_[];

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

@Resolver(YourMembershipFinanceBatch_)
export class YourMembershipFinanceBatchResolver extends ResolverBase {
    @Query(() => RunYourMembershipFinanceBatchViewResult)
    async RunYourMembershipFinanceBatchViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipFinanceBatchViewResult)
    async RunYourMembershipFinanceBatchViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipFinanceBatchViewResult)
    async RunYourMembershipFinanceBatchDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Finance Batches';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipFinanceBatch_, { nullable: true })
    async YourMembershipFinanceBatch(@Arg('BatchID', () => Int) BatchID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipFinanceBatch_ | null> {
        this.CheckUserReadPermissions('Finance Batches', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwFinanceBatches')} WHERE ${provider.QuoteIdentifier('BatchID')}=${BatchID} ` + this.getRowLevelSecurityWhereClause(provider, 'Finance Batches', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Finance Batches', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipFinanceBatchDetail_])
    async YourMembershipFinanceBatchDetails_BatchIDArray(@Root() yourmembershipfinancebatch_: YourMembershipFinanceBatch_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Finance Batch Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwFinanceBatchDetails')} WHERE ${provider.QuoteIdentifier('BatchID')}=${yourmembershipfinancebatch_.BatchID} ` + this.getRowLevelSecurityWhereClause(provider, 'Finance Batch Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Finance Batch Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipFinanceBatch_)
    async CreateYourMembershipFinanceBatch(
        @Arg('input', () => CreateYourMembershipFinanceBatchInput) input: CreateYourMembershipFinanceBatchInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Finance Batches', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipFinanceBatch_)
    async UpdateYourMembershipFinanceBatch(
        @Arg('input', () => UpdateYourMembershipFinanceBatchInput) input: UpdateYourMembershipFinanceBatchInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Finance Batches', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipFinanceBatch_)
    async DeleteYourMembershipFinanceBatch(@Arg('BatchID', () => Int) BatchID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'BatchID', Value: BatchID}]);
        return this.DeleteRecord('Finance Batches', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for GL Codes
//****************************************************************************
@ObjectType({ description: `General ledger codes for financial reporting and accounting integration` })
export class YourMembershipGLCode_ {
    @Field(() => Int) 
    GLCodeId: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GLCodeName?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipInvoiceItem_])
    YourMembershipInvoiceItems_GLCodeItemNameArray: YourMembershipInvoiceItem_[]; // Link to YourMembershipInvoiceItems
    
}

//****************************************************************************
// INPUT TYPE for GL Codes
//****************************************************************************
@InputType()
export class CreateYourMembershipGLCodeInput {
    @Field(() => Int, { nullable: true })
    GLCodeId?: number;

    @Field({ nullable: true })
    GLCodeName: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for GL Codes
//****************************************************************************
@InputType()
export class UpdateYourMembershipGLCodeInput {
    @Field(() => Int)
    GLCodeId: number;

    @Field({ nullable: true })
    GLCodeName?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for GL Codes
//****************************************************************************
@ObjectType()
export class RunYourMembershipGLCodeViewResult {
    @Field(() => [YourMembershipGLCode_])
    Results: YourMembershipGLCode_[];

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

@Resolver(YourMembershipGLCode_)
export class YourMembershipGLCodeResolver extends ResolverBase {
    @Query(() => RunYourMembershipGLCodeViewResult)
    async RunYourMembershipGLCodeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGLCodeViewResult)
    async RunYourMembershipGLCodeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGLCodeViewResult)
    async RunYourMembershipGLCodeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'GL Codes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipGLCode_, { nullable: true })
    async YourMembershipGLCode(@Arg('GLCodeId', () => Int) GLCodeId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipGLCode_ | null> {
        this.CheckUserReadPermissions('GL Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGLCodes')} WHERE ${provider.QuoteIdentifier('GLCodeId')}=${GLCodeId} ` + this.getRowLevelSecurityWhereClause(provider, 'GL Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('GL Codes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipInvoiceItem_])
    async YourMembershipInvoiceItems_GLCodeItemNameArray(@Root() yourmembershipglcode_: YourMembershipGLCode_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwInvoiceItems')} WHERE ${provider.QuoteIdentifier('GLCodeItemName')}=${yourmembershipglcode_.GLCodeId} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipGLCode_)
    async CreateYourMembershipGLCode(
        @Arg('input', () => CreateYourMembershipGLCodeInput) input: CreateYourMembershipGLCodeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('GL Codes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipGLCode_)
    async UpdateYourMembershipGLCode(
        @Arg('input', () => UpdateYourMembershipGLCodeInput) input: UpdateYourMembershipGLCodeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('GL Codes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipGLCode_)
    async DeleteYourMembershipGLCode(@Arg('GLCodeId', () => Int) GLCodeId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'GLCodeId', Value: GLCodeId}]);
        return this.DeleteRecord('GL Codes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Group Membership Logs
//****************************************************************************
@ObjectType({ description: `Audit trail of group membership changes with member details and timestamps` })
export class YourMembershipGroupMembershipLog_ {
    @Field(() => Int) 
    ItemID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ID?: string;
        
    @Field(() => Int, {nullable: true}) 
    ProfileID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    NamePrefix?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MiddleName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Suffix?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Nickname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EmployerName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    WorkTitle?: string;
        
    @Field({nullable: true}) 
    Date?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Group Membership Logs
//****************************************************************************
@InputType()
export class CreateYourMembershipGroupMembershipLogInput {
    @Field(() => Int, { nullable: true })
    ItemID?: number;

    @Field({ nullable: true })
    ID: string | null;

    @Field(() => Int, { nullable: true })
    ProfileID: number | null;

    @Field({ nullable: true })
    NamePrefix: string | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    MiddleName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    Suffix: string | null;

    @Field({ nullable: true })
    Nickname: string | null;

    @Field({ nullable: true })
    EmployerName: string | null;

    @Field({ nullable: true })
    WorkTitle: string | null;

    @Field({ nullable: true })
    Date: Date | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Group Membership Logs
//****************************************************************************
@InputType()
export class UpdateYourMembershipGroupMembershipLogInput {
    @Field(() => Int)
    ItemID: number;

    @Field({ nullable: true })
    ID?: string | null;

    @Field(() => Int, { nullable: true })
    ProfileID?: number | null;

    @Field({ nullable: true })
    NamePrefix?: string | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    MiddleName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    Suffix?: string | null;

    @Field({ nullable: true })
    Nickname?: string | null;

    @Field({ nullable: true })
    EmployerName?: string | null;

    @Field({ nullable: true })
    WorkTitle?: string | null;

    @Field({ nullable: true })
    Date?: Date | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Group Membership Logs
//****************************************************************************
@ObjectType()
export class RunYourMembershipGroupMembershipLogViewResult {
    @Field(() => [YourMembershipGroupMembershipLog_])
    Results: YourMembershipGroupMembershipLog_[];

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

@Resolver(YourMembershipGroupMembershipLog_)
export class YourMembershipGroupMembershipLogResolver extends ResolverBase {
    @Query(() => RunYourMembershipGroupMembershipLogViewResult)
    async RunYourMembershipGroupMembershipLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGroupMembershipLogViewResult)
    async RunYourMembershipGroupMembershipLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGroupMembershipLogViewResult)
    async RunYourMembershipGroupMembershipLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Group Membership Logs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipGroupMembershipLog_, { nullable: true })
    async YourMembershipGroupMembershipLog(@Arg('ItemID', () => Int) ItemID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipGroupMembershipLog_ | null> {
        this.CheckUserReadPermissions('Group Membership Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroupMembershipLogs')} WHERE ${provider.QuoteIdentifier('ItemID')}=${ItemID} ` + this.getRowLevelSecurityWhereClause(provider, 'Group Membership Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Group Membership Logs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipGroupMembershipLog_)
    async CreateYourMembershipGroupMembershipLog(
        @Arg('input', () => CreateYourMembershipGroupMembershipLogInput) input: CreateYourMembershipGroupMembershipLogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Group Membership Logs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipGroupMembershipLog_)
    async UpdateYourMembershipGroupMembershipLog(
        @Arg('input', () => UpdateYourMembershipGroupMembershipLogInput) input: UpdateYourMembershipGroupMembershipLogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Group Membership Logs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipGroupMembershipLog_)
    async DeleteYourMembershipGroupMembershipLog(@Arg('ItemID', () => Int) ItemID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ItemID', Value: ItemID}]);
        return this.DeleteRecord('Group Membership Logs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Group Types
//****************************************************************************
@ObjectType({ description: `Classification types for groups (e.g., Committee, Chapter, Section)` })
export class YourMembershipGroupType_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    TypeName?: string;
        
    @Field(() => Int, {nullable: true}) 
    SortIndex?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipGroup_])
    YourMembershipGroups_GroupTypeIdArray: YourMembershipGroup_[]; // Link to YourMembershipGroups
    
    @Field(() => [YourMembershipMemberGroup_])
    YourMembershipMemberGroups_GroupTypeIdArray: YourMembershipMemberGroup_[]; // Link to YourMembershipMemberGroups
    
}

//****************************************************************************
// INPUT TYPE for Group Types
//****************************************************************************
@InputType()
export class CreateYourMembershipGroupTypeInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    TypeName: string | null;

    @Field(() => Int, { nullable: true })
    SortIndex: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Group Types
//****************************************************************************
@InputType()
export class UpdateYourMembershipGroupTypeInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    TypeName?: string | null;

    @Field(() => Int, { nullable: true })
    SortIndex?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Group Types
//****************************************************************************
@ObjectType()
export class RunYourMembershipGroupTypeViewResult {
    @Field(() => [YourMembershipGroupType_])
    Results: YourMembershipGroupType_[];

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

@Resolver(YourMembershipGroupType_)
export class YourMembershipGroupTypeResolver extends ResolverBase {
    @Query(() => RunYourMembershipGroupTypeViewResult)
    async RunYourMembershipGroupTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGroupTypeViewResult)
    async RunYourMembershipGroupTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGroupTypeViewResult)
    async RunYourMembershipGroupTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Group Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipGroupType_, { nullable: true })
    async YourMembershipGroupType(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipGroupType_ | null> {
        this.CheckUserReadPermissions('Group Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroupTypes')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Group Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Group Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipGroup_])
    async YourMembershipGroups_GroupTypeIdArray(@Root() yourmembershipgrouptype_: YourMembershipGroupType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroups')} WHERE ${provider.QuoteIdentifier('GroupTypeId')}=${yourmembershipgrouptype_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Groups', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberGroup_])
    async YourMembershipMemberGroups_GroupTypeIdArray(@Root() yourmembershipgrouptype_: YourMembershipGroupType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroups')} WHERE ${provider.QuoteIdentifier('GroupTypeId')}=${yourmembershipgrouptype_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Groups', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipGroupType_)
    async CreateYourMembershipGroupType(
        @Arg('input', () => CreateYourMembershipGroupTypeInput) input: CreateYourMembershipGroupTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Group Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipGroupType_)
    async UpdateYourMembershipGroupType(
        @Arg('input', () => UpdateYourMembershipGroupTypeInput) input: UpdateYourMembershipGroupTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Group Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipGroupType_)
    async DeleteYourMembershipGroupType(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Group Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Groups
//****************************************************************************
@ObjectType({ description: `Committees, chapters, sections, and other organizational groups` })
export class YourMembershipGroup_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GroupTypeName?: string;
        
    @Field(() => Int, {nullable: true}) 
    GroupTypeId?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipMemberGroup_])
    YourMembershipMemberGroups_GroupIdArray: YourMembershipMemberGroup_[]; // Link to YourMembershipMemberGroups
    
    @Field(() => [YourMembershipMemberGroupBulk_])
    YourMembershipMemberGroupBulks_GroupIDArray: YourMembershipMemberGroupBulk_[]; // Link to YourMembershipMemberGroupBulks
    
}

//****************************************************************************
// INPUT TYPE for Groups
//****************************************************************************
@InputType()
export class CreateYourMembershipGroupInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    GroupTypeName: string | null;

    @Field(() => Int, { nullable: true })
    GroupTypeId: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Groups
//****************************************************************************
@InputType()
export class UpdateYourMembershipGroupInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    GroupTypeName?: string | null;

    @Field(() => Int, { nullable: true })
    GroupTypeId?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Groups
//****************************************************************************
@ObjectType()
export class RunYourMembershipGroupViewResult {
    @Field(() => [YourMembershipGroup_])
    Results: YourMembershipGroup_[];

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

@Resolver(YourMembershipGroup_)
export class YourMembershipGroupResolver extends ResolverBase {
    @Query(() => RunYourMembershipGroupViewResult)
    async RunYourMembershipGroupViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGroupViewResult)
    async RunYourMembershipGroupViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipGroupViewResult)
    async RunYourMembershipGroupDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Groups';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipGroup_, { nullable: true })
    async YourMembershipGroup(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipGroup_ | null> {
        this.CheckUserReadPermissions('Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroups')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Groups', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipMemberGroup_])
    async YourMembershipMemberGroups_GroupIdArray(@Root() yourmembershipgroup_: YourMembershipGroup_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroups')} WHERE ${provider.QuoteIdentifier('GroupId')}=${yourmembershipgroup_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Groups', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberGroupBulk_])
    async YourMembershipMemberGroupBulks_GroupIDArray(@Root() yourmembershipgroup_: YourMembershipGroup_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Group Bulks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroupBulks')} WHERE ${provider.QuoteIdentifier('GroupID')}=${yourmembershipgroup_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Group Bulks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Group Bulks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipGroup_)
    async CreateYourMembershipGroup(
        @Arg('input', () => CreateYourMembershipGroupInput) input: CreateYourMembershipGroupInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Groups', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipGroup_)
    async UpdateYourMembershipGroup(
        @Arg('input', () => UpdateYourMembershipGroupInput) input: UpdateYourMembershipGroupInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Groups', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipGroup_)
    async DeleteYourMembershipGroup(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Groups', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Invoice Items
//****************************************************************************
@ObjectType({ description: `Individual line items from invoices including dues, events, store purchases, and donations` })
export class YourMembershipInvoiceItem_ {
    @Field(() => Int) 
    LineItemID: number;
        
    @Field(() => Int, {nullable: true}) 
    InvoiceNo?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    InvoiceType?: string;
        
    @Field(() => Int, {nullable: true}) 
    WebSiteMemberID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ConstituentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    InvoiceNameFirst?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    InvoiceNameLast?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EmailAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LineItemType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LineItemDescription?: string;
        
    @Field({nullable: true}) 
    LineItemDate?: Date;
        
    @Field({nullable: true}) 
    LineItemDateEntered?: Date;
        
    @Field(() => Float, {nullable: true}) 
    LineItemAmount?: number;
        
    @Field(() => Int, {nullable: true}) 
    LineItemQuantity?: number;
        
    @Field(() => Float, {nullable: true}) 
    LineTotal?: number;
        
    @Field(() => Float, {nullable: true}) 
    OutstandingBalance?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentTerms?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GLCodeItemName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    QBClassItemName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentOption?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Invoice Items
//****************************************************************************
@InputType()
export class CreateYourMembershipInvoiceItemInput {
    @Field(() => Int, { nullable: true })
    LineItemID?: number;

    @Field(() => Int, { nullable: true })
    InvoiceNo: number | null;

    @Field({ nullable: true })
    InvoiceType: string | null;

    @Field(() => Int, { nullable: true })
    WebSiteMemberID: number | null;

    @Field({ nullable: true })
    ConstituentID: string | null;

    @Field({ nullable: true })
    InvoiceNameFirst: string | null;

    @Field({ nullable: true })
    InvoiceNameLast: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    EmailAddress: string | null;

    @Field({ nullable: true })
    LineItemType: string | null;

    @Field({ nullable: true })
    LineItemDescription: string | null;

    @Field({ nullable: true })
    LineItemDate: Date | null;

    @Field({ nullable: true })
    LineItemDateEntered: Date | null;

    @Field(() => Float, { nullable: true })
    LineItemAmount: number | null;

    @Field(() => Int, { nullable: true })
    LineItemQuantity: number | null;

    @Field(() => Float, { nullable: true })
    LineTotal: number | null;

    @Field(() => Float, { nullable: true })
    OutstandingBalance: number | null;

    @Field({ nullable: true })
    PaymentTerms: string | null;

    @Field({ nullable: true })
    GLCodeItemName: string | null;

    @Field({ nullable: true })
    QBClassItemName: string | null;

    @Field({ nullable: true })
    PaymentOption: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Invoice Items
//****************************************************************************
@InputType()
export class UpdateYourMembershipInvoiceItemInput {
    @Field(() => Int)
    LineItemID: number;

    @Field(() => Int, { nullable: true })
    InvoiceNo?: number | null;

    @Field({ nullable: true })
    InvoiceType?: string | null;

    @Field(() => Int, { nullable: true })
    WebSiteMemberID?: number | null;

    @Field({ nullable: true })
    ConstituentID?: string | null;

    @Field({ nullable: true })
    InvoiceNameFirst?: string | null;

    @Field({ nullable: true })
    InvoiceNameLast?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    EmailAddress?: string | null;

    @Field({ nullable: true })
    LineItemType?: string | null;

    @Field({ nullable: true })
    LineItemDescription?: string | null;

    @Field({ nullable: true })
    LineItemDate?: Date | null;

    @Field({ nullable: true })
    LineItemDateEntered?: Date | null;

    @Field(() => Float, { nullable: true })
    LineItemAmount?: number | null;

    @Field(() => Int, { nullable: true })
    LineItemQuantity?: number | null;

    @Field(() => Float, { nullable: true })
    LineTotal?: number | null;

    @Field(() => Float, { nullable: true })
    OutstandingBalance?: number | null;

    @Field({ nullable: true })
    PaymentTerms?: string | null;

    @Field({ nullable: true })
    GLCodeItemName?: string | null;

    @Field({ nullable: true })
    QBClassItemName?: string | null;

    @Field({ nullable: true })
    PaymentOption?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Invoice Items
//****************************************************************************
@ObjectType()
export class RunYourMembershipInvoiceItemViewResult {
    @Field(() => [YourMembershipInvoiceItem_])
    Results: YourMembershipInvoiceItem_[];

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

@Resolver(YourMembershipInvoiceItem_)
export class YourMembershipInvoiceItemResolver extends ResolverBase {
    @Query(() => RunYourMembershipInvoiceItemViewResult)
    async RunYourMembershipInvoiceItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipInvoiceItemViewResult)
    async RunYourMembershipInvoiceItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipInvoiceItemViewResult)
    async RunYourMembershipInvoiceItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Invoice Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipInvoiceItem_, { nullable: true })
    async YourMembershipInvoiceItem(@Arg('LineItemID', () => Int) LineItemID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipInvoiceItem_ | null> {
        this.CheckUserReadPermissions('Invoice Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwInvoiceItems')} WHERE ${provider.QuoteIdentifier('LineItemID')}=${LineItemID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Invoice Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipInvoiceItem_)
    async CreateYourMembershipInvoiceItem(
        @Arg('input', () => CreateYourMembershipInvoiceItemInput) input: CreateYourMembershipInvoiceItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Invoice Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipInvoiceItem_)
    async UpdateYourMembershipInvoiceItem(
        @Arg('input', () => UpdateYourMembershipInvoiceItemInput) input: UpdateYourMembershipInvoiceItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Invoice Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipInvoiceItem_)
    async DeleteYourMembershipInvoiceItem(@Arg('LineItemID', () => Int) LineItemID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'LineItemID', Value: LineItemID}]);
        return this.DeleteRecord('Invoice Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Line Items
//****************************************************************************
@ObjectType({ description: `Individual line items associated with deals, including pricing and product details` })
export class HubSpotLineItem_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    name?: string;
        
    @Field({nullable: true}) 
    description?: string;
        
    @Field(() => Float, {nullable: true}) 
    quantity?: number;
        
    @Field(() => Float, {nullable: true}) 
    price?: number;
        
    @Field(() => Float, {nullable: true}) 
    amount?: number;
        
    @Field(() => Float, {nullable: true}) 
    discount?: number;
        
    @Field(() => Float, {nullable: true}) 
    tax?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hs_product_id?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_line_item_currency_code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sku?: string;
        
    @Field(() => Float, {nullable: true}) 
    hs_cost_of_goods_sold?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_recurring_billing_period?: string;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotDealLineItem_])
    HubSpotDealLineItems_line_item_idArray: HubSpotDealLineItem_[]; // Link to HubSpotDealLineItems
    
    @Field(() => [HubSpotQuoteLineItem_])
    HubSpotQuoteLineItems_line_item_idArray: HubSpotQuoteLineItem_[]; // Link to HubSpotQuoteLineItems
    
}

//****************************************************************************
// INPUT TYPE for Line Items
//****************************************************************************
@InputType()
export class CreateHubSpotLineItemInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    name: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field(() => Float, { nullable: true })
    quantity: number | null;

    @Field(() => Float, { nullable: true })
    price: number | null;

    @Field(() => Float, { nullable: true })
    amount: number | null;

    @Field(() => Float, { nullable: true })
    discount: number | null;

    @Field(() => Float, { nullable: true })
    tax: number | null;

    @Field({ nullable: true })
    hs_product_id: string | null;

    @Field({ nullable: true })
    hs_line_item_currency_code: string | null;

    @Field({ nullable: true })
    hs_sku: string | null;

    @Field(() => Float, { nullable: true })
    hs_cost_of_goods_sold: number | null;

    @Field({ nullable: true })
    hs_recurring_billing_period: string | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Line Items
//****************************************************************************
@InputType()
export class UpdateHubSpotLineItemInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    name?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field(() => Float, { nullable: true })
    quantity?: number | null;

    @Field(() => Float, { nullable: true })
    price?: number | null;

    @Field(() => Float, { nullable: true })
    amount?: number | null;

    @Field(() => Float, { nullable: true })
    discount?: number | null;

    @Field(() => Float, { nullable: true })
    tax?: number | null;

    @Field({ nullable: true })
    hs_product_id?: string | null;

    @Field({ nullable: true })
    hs_line_item_currency_code?: string | null;

    @Field({ nullable: true })
    hs_sku?: string | null;

    @Field(() => Float, { nullable: true })
    hs_cost_of_goods_sold?: number | null;

    @Field({ nullable: true })
    hs_recurring_billing_period?: string | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Line Items
//****************************************************************************
@ObjectType()
export class RunHubSpotLineItemViewResult {
    @Field(() => [HubSpotLineItem_])
    Results: HubSpotLineItem_[];

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

@Resolver(HubSpotLineItem_)
export class HubSpotLineItemResolver extends ResolverBase {
    @Query(() => RunHubSpotLineItemViewResult)
    async RunHubSpotLineItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotLineItemViewResult)
    async RunHubSpotLineItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotLineItemViewResult)
    async RunHubSpotLineItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Line Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotLineItem_, { nullable: true })
    async HubSpotLineItem(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotLineItem_ | null> {
        this.CheckUserReadPermissions('Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwLineItems')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Line Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotDealLineItem_])
    async HubSpotDealLineItems_line_item_idArray(@Root() hubspotlineitem_: HubSpotLineItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealLineItems')} WHERE ${provider.QuoteIdentifier('line_item_id')}='${hubspotlineitem_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Line Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotQuoteLineItem_])
    async HubSpotQuoteLineItems_line_item_idArray(@Root() hubspotlineitem_: HubSpotLineItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Quote Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuoteLineItems')} WHERE ${provider.QuoteIdentifier('line_item_id')}='${hubspotlineitem_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quote Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Quote Line Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotLineItem_)
    async CreateHubSpotLineItem(
        @Arg('input', () => CreateHubSpotLineItemInput) input: CreateHubSpotLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Line Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotLineItem_)
    async UpdateHubSpotLineItem(
        @Arg('input', () => UpdateHubSpotLineItemInput) input: UpdateHubSpotLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Line Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotLineItem_)
    async DeleteHubSpotLineItem(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Line Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Locations
//****************************************************************************
@ObjectType({ description: `States, provinces, and regions within countries with tax GL codes` })
export class YourMembershipLocation_ {
    @Field() 
    @MaxLength(200)
    locationCode: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    countryId?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    locationName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    taxGLCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    taxQBClass?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Locations
//****************************************************************************
@InputType()
export class CreateYourMembershipLocationInput {
    @Field({ nullable: true })
    locationCode?: string;

    @Field({ nullable: true })
    countryId: string | null;

    @Field({ nullable: true })
    locationName: string | null;

    @Field({ nullable: true })
    taxGLCode: string | null;

    @Field({ nullable: true })
    taxQBClass: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Locations
//****************************************************************************
@InputType()
export class UpdateYourMembershipLocationInput {
    @Field()
    locationCode: string;

    @Field({ nullable: true })
    countryId?: string | null;

    @Field({ nullable: true })
    locationName?: string | null;

    @Field({ nullable: true })
    taxGLCode?: string | null;

    @Field({ nullable: true })
    taxQBClass?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Locations
//****************************************************************************
@ObjectType()
export class RunYourMembershipLocationViewResult {
    @Field(() => [YourMembershipLocation_])
    Results: YourMembershipLocation_[];

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

@Resolver(YourMembershipLocation_)
export class YourMembershipLocationResolver extends ResolverBase {
    @Query(() => RunYourMembershipLocationViewResult)
    async RunYourMembershipLocationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipLocationViewResult)
    async RunYourMembershipLocationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipLocationViewResult)
    async RunYourMembershipLocationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Locations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipLocation_, { nullable: true })
    async YourMembershipLocation(@Arg('locationCode', () => String) locationCode: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipLocation_ | null> {
        this.CheckUserReadPermissions('Locations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwLocations')} WHERE ${provider.QuoteIdentifier('locationCode')}='${locationCode}' ` + this.getRowLevelSecurityWhereClause(provider, 'Locations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Locations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipLocation_)
    async CreateYourMembershipLocation(
        @Arg('input', () => CreateYourMembershipLocationInput) input: CreateYourMembershipLocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Locations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipLocation_)
    async UpdateYourMembershipLocation(
        @Arg('input', () => UpdateYourMembershipLocationInput) input: UpdateYourMembershipLocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Locations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipLocation_)
    async DeleteYourMembershipLocation(@Arg('locationCode', () => String) locationCode: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'locationCode', Value: locationCode}]);
        return this.DeleteRecord('Locations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Meetings
//****************************************************************************
@ObjectType({ description: `Scheduled meetings with time, location, outcome, and notes` })
export class HubSpotMeeting_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_meeting_title?: string;
        
    @Field({nullable: true}) 
    hs_meeting_body?: string;
        
    @Field({nullable: true}) 
    hs_meeting_start_time?: Date;
        
    @Field({nullable: true}) 
    hs_meeting_end_time?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_meeting_outcome?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_meeting_location?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    hs_meeting_external_url?: string;
        
    @Field({nullable: true}) 
    hs_internal_meeting_notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_activity_type?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({nullable: true}) 
    hs_timestamp?: Date;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotDealMeeting_])
    HubSpotDealMeetings_meeting_idArray: HubSpotDealMeeting_[]; // Link to HubSpotDealMeetings
    
    @Field(() => [HubSpotCompanyMeeting_])
    HubSpotCompanyMeetings_meeting_idArray: HubSpotCompanyMeeting_[]; // Link to HubSpotCompanyMeetings
    
    @Field(() => [HubSpotContactMeeting_])
    HubSpotContactMeetings_meeting_idArray: HubSpotContactMeeting_[]; // Link to HubSpotContactMeetings
    
    @Field(() => [HubSpotTicketMeeting_])
    HubSpotTicketMeetings_meeting_idArray: HubSpotTicketMeeting_[]; // Link to HubSpotTicketMeetings
    
}

//****************************************************************************
// INPUT TYPE for Meetings
//****************************************************************************
@InputType()
export class CreateHubSpotMeetingInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_meeting_title: string | null;

    @Field({ nullable: true })
    hs_meeting_body: string | null;

    @Field({ nullable: true })
    hs_meeting_start_time: Date | null;

    @Field({ nullable: true })
    hs_meeting_end_time: Date | null;

    @Field({ nullable: true })
    hs_meeting_outcome: string | null;

    @Field({ nullable: true })
    hs_meeting_location: string | null;

    @Field({ nullable: true })
    hs_meeting_external_url: string | null;

    @Field({ nullable: true })
    hs_internal_meeting_notes: string | null;

    @Field({ nullable: true })
    hs_activity_type: string | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    hs_timestamp: Date | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Meetings
//****************************************************************************
@InputType()
export class UpdateHubSpotMeetingInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_meeting_title?: string | null;

    @Field({ nullable: true })
    hs_meeting_body?: string | null;

    @Field({ nullable: true })
    hs_meeting_start_time?: Date | null;

    @Field({ nullable: true })
    hs_meeting_end_time?: Date | null;

    @Field({ nullable: true })
    hs_meeting_outcome?: string | null;

    @Field({ nullable: true })
    hs_meeting_location?: string | null;

    @Field({ nullable: true })
    hs_meeting_external_url?: string | null;

    @Field({ nullable: true })
    hs_internal_meeting_notes?: string | null;

    @Field({ nullable: true })
    hs_activity_type?: string | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    hs_timestamp?: Date | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Meetings
//****************************************************************************
@ObjectType()
export class RunHubSpotMeetingViewResult {
    @Field(() => [HubSpotMeeting_])
    Results: HubSpotMeeting_[];

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

@Resolver(HubSpotMeeting_)
export class HubSpotMeetingResolver extends ResolverBase {
    @Query(() => RunHubSpotMeetingViewResult)
    async RunHubSpotMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotMeetingViewResult)
    async RunHubSpotMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotMeetingViewResult)
    async RunHubSpotMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotMeeting_, { nullable: true })
    async HubSpotMeeting(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotMeeting_ | null> {
        this.CheckUserReadPermissions('Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwMeetings')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Meetings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotDealMeeting_])
    async HubSpotDealMeetings_meeting_idArray(@Root() hubspotmeeting_: HubSpotMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealMeetings')} WHERE ${provider.QuoteIdentifier('meeting_id')}='${hubspotmeeting_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyMeeting_])
    async HubSpotCompanyMeetings_meeting_idArray(@Root() hubspotmeeting_: HubSpotMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyMeetings')} WHERE ${provider.QuoteIdentifier('meeting_id')}='${hubspotmeeting_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactMeeting_])
    async HubSpotContactMeetings_meeting_idArray(@Root() hubspotmeeting_: HubSpotMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactMeetings')} WHERE ${provider.QuoteIdentifier('meeting_id')}='${hubspotmeeting_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketMeeting_])
    async HubSpotTicketMeetings_meeting_idArray(@Root() hubspotmeeting_: HubSpotMeeting_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketMeetings')} WHERE ${provider.QuoteIdentifier('meeting_id')}='${hubspotmeeting_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotMeeting_)
    async CreateHubSpotMeeting(
        @Arg('input', () => CreateHubSpotMeetingInput) input: CreateHubSpotMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotMeeting_)
    async UpdateHubSpotMeeting(
        @Arg('input', () => UpdateHubSpotMeetingInput) input: UpdateHubSpotMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotMeeting_)
    async DeleteHubSpotMeeting(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Favorites
//****************************************************************************
@ObjectType({ description: `Bookmarked/favorited items per member for personalization tracking` })
export class YourMembershipMemberFavorite_ {
    @Field(() => Int) 
    FavoriteId: number;
        
    @Field(() => Int, {nullable: true}) 
    ProfileID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ItemType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ItemId?: string;
        
    @Field({nullable: true}) 
    DateAdded?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Favorites
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberFavoriteInput {
    @Field(() => Int, { nullable: true })
    FavoriteId?: number;

    @Field(() => Int, { nullable: true })
    ProfileID: number | null;

    @Field({ nullable: true })
    ItemType: string | null;

    @Field({ nullable: true })
    ItemId: string | null;

    @Field({ nullable: true })
    DateAdded: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Favorites
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberFavoriteInput {
    @Field(() => Int)
    FavoriteId: number;

    @Field(() => Int, { nullable: true })
    ProfileID?: number | null;

    @Field({ nullable: true })
    ItemType?: string | null;

    @Field({ nullable: true })
    ItemId?: string | null;

    @Field({ nullable: true })
    DateAdded?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Favorites
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberFavoriteViewResult {
    @Field(() => [YourMembershipMemberFavorite_])
    Results: YourMembershipMemberFavorite_[];

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

@Resolver(YourMembershipMemberFavorite_)
export class YourMembershipMemberFavoriteResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberFavoriteViewResult)
    async RunYourMembershipMemberFavoriteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberFavoriteViewResult)
    async RunYourMembershipMemberFavoriteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberFavoriteViewResult)
    async RunYourMembershipMemberFavoriteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Favorites';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberFavorite_, { nullable: true })
    async YourMembershipMemberFavorite(@Arg('FavoriteId', () => Int) FavoriteId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberFavorite_ | null> {
        this.CheckUserReadPermissions('Member Favorites', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberFavorites')} WHERE ${provider.QuoteIdentifier('FavoriteId')}=${FavoriteId} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Favorites', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Favorites', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMemberFavorite_)
    async CreateYourMembershipMemberFavorite(
        @Arg('input', () => CreateYourMembershipMemberFavoriteInput) input: CreateYourMembershipMemberFavoriteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Favorites', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberFavorite_)
    async UpdateYourMembershipMemberFavorite(
        @Arg('input', () => UpdateYourMembershipMemberFavoriteInput) input: UpdateYourMembershipMemberFavoriteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Favorites', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberFavorite_)
    async DeleteYourMembershipMemberFavorite(@Arg('FavoriteId', () => Int) FavoriteId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'FavoriteId', Value: FavoriteId}]);
        return this.DeleteRecord('Member Favorites', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Group Bulks
//****************************************************************************
@ObjectType({ description: `Bulk member-to-group assignments with group codes and primary group designation` })
export class YourMembershipMemberGroupBulk_ {
    @Field(() => Int) 
    WebSiteMemberID: number;
        
    @Field(() => Int) 
    GroupID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GroupCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GroupName?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    PrimaryGroup?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Group Bulks
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberGroupBulkInput {
    @Field(() => Int, { nullable: true })
    WebSiteMemberID?: number;

    @Field(() => Int, { nullable: true })
    GroupID?: number;

    @Field({ nullable: true })
    GroupCode: string | null;

    @Field({ nullable: true })
    GroupName: string | null;

    @Field(() => Boolean, { nullable: true })
    PrimaryGroup: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Group Bulks
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberGroupBulkInput {
    @Field(() => Int)
    WebSiteMemberID: number;

    @Field(() => Int)
    GroupID: number;

    @Field({ nullable: true })
    GroupCode?: string | null;

    @Field({ nullable: true })
    GroupName?: string | null;

    @Field(() => Boolean, { nullable: true })
    PrimaryGroup?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Group Bulks
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberGroupBulkViewResult {
    @Field(() => [YourMembershipMemberGroupBulk_])
    Results: YourMembershipMemberGroupBulk_[];

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

@Resolver(YourMembershipMemberGroupBulk_)
export class YourMembershipMemberGroupBulkResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberGroupBulkViewResult)
    async RunYourMembershipMemberGroupBulkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberGroupBulkViewResult)
    async RunYourMembershipMemberGroupBulkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberGroupBulkViewResult)
    async RunYourMembershipMemberGroupBulkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Group Bulks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberGroupBulk_, { nullable: true })
    async YourMembershipMemberGroupBulk(@Arg('WebSiteMemberID', () => Int) WebSiteMemberID: number, @Arg('GroupID', () => Int) GroupID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberGroupBulk_ | null> {
        this.CheckUserReadPermissions('Member Group Bulks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroupBulks')} WHERE ${provider.QuoteIdentifier('WebSiteMemberID')}=${WebSiteMemberID} AND ${provider.QuoteIdentifier('GroupID')}=${GroupID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Group Bulks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Group Bulks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMemberGroupBulk_)
    async CreateYourMembershipMemberGroupBulk(
        @Arg('input', () => CreateYourMembershipMemberGroupBulkInput) input: CreateYourMembershipMemberGroupBulkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Group Bulks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberGroupBulk_)
    async UpdateYourMembershipMemberGroupBulk(
        @Arg('input', () => UpdateYourMembershipMemberGroupBulkInput) input: UpdateYourMembershipMemberGroupBulkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Group Bulks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberGroupBulk_)
    async DeleteYourMembershipMemberGroupBulk(@Arg('WebSiteMemberID', () => Int) WebSiteMemberID: number, @Arg('GroupID', () => Int) GroupID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'WebSiteMemberID', Value: WebSiteMemberID}, {FieldName: 'GroupID', Value: GroupID}]);
        return this.DeleteRecord('Member Group Bulks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Groups
//****************************************************************************
@ObjectType({ description: `Association between members and their group/committee memberships` })
export class YourMembershipMemberGroup_ {
    @Field() 
    @MaxLength(200)
    MemberGroupId: string;
        
    @Field(() => Int, {nullable: true}) 
    ProfileID?: number;
        
    @Field(() => Int, {nullable: true}) 
    GroupId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GroupName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    GroupTypeName?: string;
        
    @Field(() => Int, {nullable: true}) 
    GroupTypeId?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Groups
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberGroupInput {
    @Field({ nullable: true })
    MemberGroupId?: string;

    @Field(() => Int, { nullable: true })
    ProfileID: number | null;

    @Field(() => Int, { nullable: true })
    GroupId: number | null;

    @Field({ nullable: true })
    GroupName: string | null;

    @Field({ nullable: true })
    GroupTypeName: string | null;

    @Field(() => Int, { nullable: true })
    GroupTypeId: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Groups
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberGroupInput {
    @Field()
    MemberGroupId: string;

    @Field(() => Int, { nullable: true })
    ProfileID?: number | null;

    @Field(() => Int, { nullable: true })
    GroupId?: number | null;

    @Field({ nullable: true })
    GroupName?: string | null;

    @Field({ nullable: true })
    GroupTypeName?: string | null;

    @Field(() => Int, { nullable: true })
    GroupTypeId?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Groups
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberGroupViewResult {
    @Field(() => [YourMembershipMemberGroup_])
    Results: YourMembershipMemberGroup_[];

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

@Resolver(YourMembershipMemberGroup_)
export class YourMembershipMemberGroupResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberGroupViewResult)
    async RunYourMembershipMemberGroupViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberGroupViewResult)
    async RunYourMembershipMemberGroupViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberGroupViewResult)
    async RunYourMembershipMemberGroupDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Groups';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberGroup_, { nullable: true })
    async YourMembershipMemberGroup(@Arg('MemberGroupId', () => String) MemberGroupId: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberGroup_ | null> {
        this.CheckUserReadPermissions('Member Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroups')} WHERE ${provider.QuoteIdentifier('MemberGroupId')}='${MemberGroupId}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Groups', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMemberGroup_)
    async CreateYourMembershipMemberGroup(
        @Arg('input', () => CreateYourMembershipMemberGroupInput) input: CreateYourMembershipMemberGroupInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Groups', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberGroup_)
    async UpdateYourMembershipMemberGroup(
        @Arg('input', () => UpdateYourMembershipMemberGroupInput) input: UpdateYourMembershipMemberGroupInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Groups', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberGroup_)
    async DeleteYourMembershipMemberGroup(@Arg('MemberGroupId', () => String) MemberGroupId: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'MemberGroupId', Value: MemberGroupId}]);
        return this.DeleteRecord('Member Groups', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Networks
//****************************************************************************
@ObjectType({ description: `Social network profile links for members (LinkedIn, Twitter, etc.)` })
export class YourMembershipMemberNetwork_ {
    @Field(() => Int) 
    NetworkId: number;
        
    @Field(() => Int, {nullable: true}) 
    ProfileID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    NetworkType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ProfileUrl?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Networks
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberNetworkInput {
    @Field(() => Int, { nullable: true })
    NetworkId?: number;

    @Field(() => Int, { nullable: true })
    ProfileID: number | null;

    @Field({ nullable: true })
    NetworkType: string | null;

    @Field({ nullable: true })
    ProfileUrl: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Networks
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberNetworkInput {
    @Field(() => Int)
    NetworkId: number;

    @Field(() => Int, { nullable: true })
    ProfileID?: number | null;

    @Field({ nullable: true })
    NetworkType?: string | null;

    @Field({ nullable: true })
    ProfileUrl?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Networks
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberNetworkViewResult {
    @Field(() => [YourMembershipMemberNetwork_])
    Results: YourMembershipMemberNetwork_[];

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

@Resolver(YourMembershipMemberNetwork_)
export class YourMembershipMemberNetworkResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberNetworkViewResult)
    async RunYourMembershipMemberNetworkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberNetworkViewResult)
    async RunYourMembershipMemberNetworkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberNetworkViewResult)
    async RunYourMembershipMemberNetworkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Networks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberNetwork_, { nullable: true })
    async YourMembershipMemberNetwork(@Arg('NetworkId', () => Int) NetworkId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberNetwork_ | null> {
        this.CheckUserReadPermissions('Member Networks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberNetworks')} WHERE ${provider.QuoteIdentifier('NetworkId')}=${NetworkId} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Networks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Networks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMemberNetwork_)
    async CreateYourMembershipMemberNetwork(
        @Arg('input', () => CreateYourMembershipMemberNetworkInput) input: CreateYourMembershipMemberNetworkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Networks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberNetwork_)
    async UpdateYourMembershipMemberNetwork(
        @Arg('input', () => UpdateYourMembershipMemberNetworkInput) input: UpdateYourMembershipMemberNetworkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Networks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberNetwork_)
    async DeleteYourMembershipMemberNetwork(@Arg('NetworkId', () => Int) NetworkId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'NetworkId', Value: NetworkId}]);
        return this.DeleteRecord('Member Networks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Profiles
//****************************************************************************
@ObjectType({ description: `Comprehensive member profile data including custom fields, richer than basic member list` })
export class YourMembershipMemberProfile_ {
    @Field(() => Int) 
    ProfileID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EmailAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MemberTypeCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({nullable: true}) 
    JoinDate?: Date;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedDate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipGroupMembershipLog_])
    YourMembershipGroupMembershipLogs_ProfileIDArray: YourMembershipGroupMembershipLog_[]; // Link to YourMembershipGroupMembershipLogs
    
    @Field(() => [YourMembershipConnection_])
    YourMembershipConnections_ProfileIDArray: YourMembershipConnection_[]; // Link to YourMembershipConnections
    
    @Field(() => [YourMembershipMemberFavorite_])
    YourMembershipMemberFavorites_ProfileIDArray: YourMembershipMemberFavorite_[]; // Link to YourMembershipMemberFavorites
    
    @Field(() => [YourMembershipDonationHistory_])
    YourMembershipDonationHistories_ProfileIDArray: YourMembershipDonationHistory_[]; // Link to YourMembershipDonationHistories
    
    @Field(() => [YourMembershipMemberNetwork_])
    YourMembershipMemberNetworks_ProfileIDArray: YourMembershipMemberNetwork_[]; // Link to YourMembershipMemberNetworks
    
    @Field(() => [YourMembershipEngagementScore_])
    YourMembershipEngagementScores_ProfileIDArray: YourMembershipEngagementScore_[]; // Link to YourMembershipEngagementScores
    
    @Field(() => [YourMembershipMemberGroup_])
    YourMembershipMemberGroups_ProfileIDArray: YourMembershipMemberGroup_[]; // Link to YourMembershipMemberGroups
    
}

//****************************************************************************
// INPUT TYPE for Member Profiles
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberProfileInput {
    @Field(() => Int, { nullable: true })
    ProfileID?: number;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    EmailAddress: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    MemberTypeCode: string | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    JoinDate: Date | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    LastModifiedDate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Profiles
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberProfileInput {
    @Field(() => Int)
    ProfileID: number;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    EmailAddress?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    MemberTypeCode?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    JoinDate?: Date | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    LastModifiedDate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Profiles
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberProfileViewResult {
    @Field(() => [YourMembershipMemberProfile_])
    Results: YourMembershipMemberProfile_[];

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

@Resolver(YourMembershipMemberProfile_)
export class YourMembershipMemberProfileResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberProfileViewResult)
    async RunYourMembershipMemberProfileViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberProfileViewResult)
    async RunYourMembershipMemberProfileViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberProfileViewResult)
    async RunYourMembershipMemberProfileDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Profiles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberProfile_, { nullable: true })
    async YourMembershipMemberProfile(@Arg('ProfileID', () => Int) ProfileID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberProfile_ | null> {
        this.CheckUserReadPermissions('Member Profiles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberProfiles')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Profiles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Profiles', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipGroupMembershipLog_])
    async YourMembershipGroupMembershipLogs_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Group Membership Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwGroupMembershipLogs')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Group Membership Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Group Membership Logs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipConnection_])
    async YourMembershipConnections_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Connections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwConnections')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Connections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Connections', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberFavorite_])
    async YourMembershipMemberFavorites_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Favorites', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberFavorites')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Favorites', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Favorites', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDonationHistory_])
    async YourMembershipDonationHistories_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donation Histories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationHistories')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Histories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donation Histories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberNetwork_])
    async YourMembershipMemberNetworks_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Networks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberNetworks')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Networks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Networks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipEngagementScore_])
    async YourMembershipEngagementScores_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Engagement Scores', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwEngagementScores')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Engagement Scores', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Engagement Scores', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberGroup_])
    async YourMembershipMemberGroups_ProfileIDArray(@Root() yourmembershipmemberprofile_: YourMembershipMemberProfile_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroups')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${yourmembershipmemberprofile_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Groups', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipMemberProfile_)
    async CreateYourMembershipMemberProfile(
        @Arg('input', () => CreateYourMembershipMemberProfileInput) input: CreateYourMembershipMemberProfileInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Profiles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberProfile_)
    async UpdateYourMembershipMemberProfile(
        @Arg('input', () => UpdateYourMembershipMemberProfileInput) input: UpdateYourMembershipMemberProfileInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Profiles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberProfile_)
    async DeleteYourMembershipMemberProfile(@Arg('ProfileID', () => Int) ProfileID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ProfileID', Value: ProfileID}]);
        return this.DeleteRecord('Member Profiles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Referrals
//****************************************************************************
@ObjectType({ description: `Member-to-member referral tracking records` })
export class YourMembershipMemberReferral_ {
    @Field(() => Int) 
    ReferralId: number;
        
    @Field(() => Int, {nullable: true}) 
    ReferrerID?: number;
        
    @Field(() => Int, {nullable: true}) 
    ReferredID?: number;
        
    @Field({nullable: true}) 
    ReferralDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Referrals
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberReferralInput {
    @Field(() => Int, { nullable: true })
    ReferralId?: number;

    @Field(() => Int, { nullable: true })
    ReferrerID: number | null;

    @Field(() => Int, { nullable: true })
    ReferredID: number | null;

    @Field({ nullable: true })
    ReferralDate: Date | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Referrals
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberReferralInput {
    @Field(() => Int)
    ReferralId: number;

    @Field(() => Int, { nullable: true })
    ReferrerID?: number | null;

    @Field(() => Int, { nullable: true })
    ReferredID?: number | null;

    @Field({ nullable: true })
    ReferralDate?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Referrals
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberReferralViewResult {
    @Field(() => [YourMembershipMemberReferral_])
    Results: YourMembershipMemberReferral_[];

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

@Resolver(YourMembershipMemberReferral_)
export class YourMembershipMemberReferralResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberReferralViewResult)
    async RunYourMembershipMemberReferralViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberReferralViewResult)
    async RunYourMembershipMemberReferralViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberReferralViewResult)
    async RunYourMembershipMemberReferralDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Referrals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberReferral_, { nullable: true })
    async YourMembershipMemberReferral(@Arg('ReferralId', () => Int) ReferralId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberReferral_ | null> {
        this.CheckUserReadPermissions('Member Referrals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberReferrals')} WHERE ${provider.QuoteIdentifier('ReferralId')}=${ReferralId} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Referrals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Referrals', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMemberReferral_)
    async CreateYourMembershipMemberReferral(
        @Arg('input', () => CreateYourMembershipMemberReferralInput) input: CreateYourMembershipMemberReferralInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Referrals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberReferral_)
    async UpdateYourMembershipMemberReferral(
        @Arg('input', () => UpdateYourMembershipMemberReferralInput) input: UpdateYourMembershipMemberReferralInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Referrals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberReferral_)
    async DeleteYourMembershipMemberReferral(@Arg('ReferralId', () => Int) ReferralId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ReferralId', Value: ReferralId}]);
        return this.DeleteRecord('Member Referrals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Sub Accounts
//****************************************************************************
@ObjectType({ description: `Sub-account relationships linking dependent members to primary accounts` })
export class YourMembershipMemberSubAccount_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
        
    @Field({nullable: true}) 
    DateRegistered?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Sub Accounts
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberSubAccountInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    ParentID: number | null;

    @Field({ nullable: true })
    DateRegistered: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Sub Accounts
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberSubAccountInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    ParentID?: number | null;

    @Field({ nullable: true })
    DateRegistered?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Sub Accounts
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberSubAccountViewResult {
    @Field(() => [YourMembershipMemberSubAccount_])
    Results: YourMembershipMemberSubAccount_[];

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

@Resolver(YourMembershipMemberSubAccount_)
export class YourMembershipMemberSubAccountResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberSubAccountViewResult)
    async RunYourMembershipMemberSubAccountViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberSubAccountViewResult)
    async RunYourMembershipMemberSubAccountViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberSubAccountViewResult)
    async RunYourMembershipMemberSubAccountDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Sub Accounts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberSubAccount_, { nullable: true })
    async YourMembershipMemberSubAccount(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberSubAccount_ | null> {
        this.CheckUserReadPermissions('Member Sub Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberSubAccounts')} WHERE ${provider.QuoteIdentifier('ID')}=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Sub Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Sub Accounts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMemberSubAccount_)
    async CreateYourMembershipMemberSubAccount(
        @Arg('input', () => CreateYourMembershipMemberSubAccountInput) input: CreateYourMembershipMemberSubAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Sub Accounts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberSubAccount_)
    async UpdateYourMembershipMemberSubAccount(
        @Arg('input', () => UpdateYourMembershipMemberSubAccountInput) input: UpdateYourMembershipMemberSubAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Sub Accounts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberSubAccount_)
    async DeleteYourMembershipMemberSubAccount(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Member Sub Accounts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Types
//****************************************************************************
@ObjectType({ description: `Classification types for members (e.g., Individual, Corporate, Student)` })
export class YourMembershipMemberType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    TypeCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDefault?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PresetType?: string;
        
    @Field(() => Int, {nullable: true}) 
    SortOrder?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipMemberProfile_])
    YourMembershipMemberProfiles_MemberTypeCodeArray: YourMembershipMemberProfile_[]; // Link to YourMembershipMemberProfiles
    
    @Field(() => [YourMembershipPersonID_])
    YourMembershipPersonIDs_UserTypeArray: YourMembershipPersonID_[]; // Link to YourMembershipPersonIDs
    
    @Field(() => [YourMembershipDuesTransaction_])
    YourMembershipDuesTransactions_MemberTypeArray: YourMembershipDuesTransaction_[]; // Link to YourMembershipDuesTransactions
    
    @Field(() => [YourMembershipMember_])
    YourMembershipMembers_MemberTypeCodeArray: YourMembershipMember_[]; // Link to YourMembershipMembers
    
}

//****************************************************************************
// INPUT TYPE for Member Types
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberTypeInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    TypeCode?: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault: boolean | null;

    @Field({ nullable: true })
    PresetType: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Types
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    TypeCode: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean | null;

    @Field({ nullable: true })
    PresetType?: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Types
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberTypeViewResult {
    @Field(() => [YourMembershipMemberType_])
    Results: YourMembershipMemberType_[];

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

@Resolver(YourMembershipMemberType_)
export class YourMembershipMemberTypeResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberTypeViewResult)
    async RunYourMembershipMemberTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberTypeViewResult)
    async RunYourMembershipMemberTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberTypeViewResult)
    async RunYourMembershipMemberTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMemberType_, { nullable: true })
    async YourMembershipMemberType(@Arg('ID', () => Int) ID: number, @Arg('TypeCode', () => String) TypeCode: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMemberType_ | null> {
        this.CheckUserReadPermissions('Member Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${ID} AND ${provider.QuoteIdentifier('TypeCode')}='${TypeCode}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipMemberProfile_])
    async YourMembershipMemberProfiles_MemberTypeCodeArray(@Root() yourmembershipmembertype_: YourMembershipMemberType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Profiles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberProfiles')} WHERE ${provider.QuoteIdentifier('MemberTypeCode')}=${yourmembershipmembertype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Profiles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Profiles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipPersonID_])
    async YourMembershipPersonIDs_UserTypeArray(@Root() yourmembershipmembertype_: YourMembershipMemberType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person IDs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwPersonIDs')} WHERE ${provider.QuoteIdentifier('UserType')}=${yourmembershipmembertype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Person IDs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Person IDs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDuesTransaction_])
    async YourMembershipDuesTransactions_MemberTypeArray(@Root() yourmembershipmembertype_: YourMembershipMemberType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dues Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesTransactions')} WHERE ${provider.QuoteIdentifier('MemberType')}=${yourmembershipmembertype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dues Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMember_])
    async YourMembershipMembers_MemberTypeCodeArray(@Root() yourmembershipmembertype_: YourMembershipMemberType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembers')} WHERE ${provider.QuoteIdentifier('MemberTypeCode')}=${yourmembershipmembertype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipMemberType_)
    async CreateYourMembershipMemberType(
        @Arg('input', () => CreateYourMembershipMemberTypeInput) input: CreateYourMembershipMemberTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMemberType_)
    async UpdateYourMembershipMemberType(
        @Arg('input', () => UpdateYourMembershipMemberTypeInput) input: UpdateYourMembershipMemberTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMemberType_)
    async DeleteYourMembershipMemberType(@Arg('ID', () => Int) ID: number, @Arg('TypeCode', () => String) TypeCode: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}, {FieldName: 'TypeCode', Value: TypeCode}]);
        return this.DeleteRecord('Member Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Members
//****************************************************************************
@ObjectType({ description: `Organization members with profile, contact, and membership details` })
export class YourMembershipMember_ {
    @Field(() => Int) 
    ProfileID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EmailAddr?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MemberTypeCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Address1?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Address2?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PostalCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true}) 
    JoinDate?: Date;
        
    @Field({nullable: true}) 
    RenewalDate?: Date;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field({nullable: true}) 
    MemberSinceDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    WebsiteUrl?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipMemberGroupBulk_])
    YourMembershipMemberGroupBulks_WebSiteMemberIDArray: YourMembershipMemberGroupBulk_[]; // Link to YourMembershipMemberGroupBulks
    
    @Field(() => [YourMembershipMemberReferral_])
    YourMembershipMemberReferrals_ReferredIDArray: YourMembershipMemberReferral_[]; // Link to YourMembershipMemberReferrals
    
    @Field(() => [YourMembershipCertificationJournal_])
    YourMembershipCertificationJournals_WebsiteMemberIDArray: YourMembershipCertificationJournal_[]; // Link to YourMembershipCertificationJournals
    
    @Field(() => [YourMembershipDuesTransaction_])
    YourMembershipDuesTransactions_WebsiteMemberIDArray: YourMembershipDuesTransaction_[]; // Link to YourMembershipDuesTransactions
    
    @Field(() => [YourMembershipMemberSubAccount_])
    YourMembershipMemberSubAccounts_IDArray: YourMembershipMemberSubAccount_[]; // Link to YourMembershipMemberSubAccounts
    
    @Field(() => [YourMembershipMemberReferral_])
    YourMembershipMemberReferrals_ReferrerIDArray: YourMembershipMemberReferral_[]; // Link to YourMembershipMemberReferrals
    
    @Field(() => [YourMembershipDonationTransaction_])
    YourMembershipDonationTransactions_WebsiteMemberIDArray: YourMembershipDonationTransaction_[]; // Link to YourMembershipDonationTransactions
    
    @Field(() => [YourMembershipMemberSubAccount_])
    YourMembershipMemberSubAccounts_ParentIDArray: YourMembershipMemberSubAccount_[]; // Link to YourMembershipMemberSubAccounts
    
    @Field(() => [YourMembershipStoreOrder_])
    YourMembershipStoreOrders_WebsiteMemberIDArray: YourMembershipStoreOrder_[]; // Link to YourMembershipStoreOrders
    
    @Field(() => [YourMembershipStoreOrderDetail_])
    YourMembershipStoreOrderDetails_WebsiteMemberIDArray: YourMembershipStoreOrderDetail_[]; // Link to YourMembershipStoreOrderDetails
    
    @Field(() => [YourMembershipInvoiceItem_])
    YourMembershipInvoiceItems_WebSiteMemberIDArray: YourMembershipInvoiceItem_[]; // Link to YourMembershipInvoiceItems
    
    @Field(() => [HubSpotQuote_])
    HubSpotQuotes_hs_sender_emailArray: HubSpotQuote_[]; // Link to HubSpotQuotes
    
    @Field(() => [HubSpotEmail_])
    HubSpotEmails_hs_email_sender_emailArray: HubSpotEmail_[]; // Link to HubSpotEmails
    
    @Field(() => [HubSpotEmail_])
    HubSpotEmails_hs_email_sender_firstnameArray: HubSpotEmail_[]; // Link to HubSpotEmails
    
    @Field(() => [HubSpotEmail_])
    HubSpotEmails_hs_email_sender_lastnameArray: HubSpotEmail_[]; // Link to HubSpotEmails
    
    @Field(() => [HubSpotEmail_])
    HubSpotEmails_hs_email_to_emailArray: HubSpotEmail_[]; // Link to HubSpotEmails
    
    @Field(() => [HubSpotCompany_])
    HubSpotCompanies_cityArray: HubSpotCompany_[]; // Link to HubSpotCompanies
    
    @Field(() => [HubSpotCompany_])
    HubSpotCompanies_addressArray: HubSpotCompany_[]; // Link to HubSpotCompanies
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_emailArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotCompany_])
    HubSpotCompanies_address2Array: HubSpotCompany_[]; // Link to HubSpotCompanies
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_lastnameArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotCompany_])
    HubSpotCompanies_phoneArray: HubSpotCompany_[]; // Link to HubSpotCompanies
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_countryArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotCompany_])
    HubSpotCompanies_stateArray: HubSpotCompany_[]; // Link to HubSpotCompanies
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_firstnameArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotCompany_])
    HubSpotCompanies_countryArray: HubSpotCompany_[]; // Link to HubSpotCompanies
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_cityArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_stateArray: HubSpotContact_[]; // Link to HubSpotContacts
    
    @Field(() => [HubSpotContact_])
    HubSpotContacts_phoneArray: HubSpotContact_[]; // Link to HubSpotContacts
    
}

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class CreateYourMembershipMemberInput {
    @Field(() => Int, { nullable: true })
    ProfileID?: number;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    EmailAddr: string | null;

    @Field({ nullable: true })
    MemberTypeCode: string | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Address1: string | null;

    @Field({ nullable: true })
    Address2: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    Country: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    JoinDate: Date | null;

    @Field({ nullable: true })
    RenewalDate: Date | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    MemberSinceDate: Date | null;

    @Field({ nullable: true })
    WebsiteUrl: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class UpdateYourMembershipMemberInput {
    @Field(() => Int)
    ProfileID: number;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    EmailAddr?: string | null;

    @Field({ nullable: true })
    MemberTypeCode?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Address1?: string | null;

    @Field({ nullable: true })
    Address2?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    JoinDate?: Date | null;

    @Field({ nullable: true })
    RenewalDate?: Date | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    MemberSinceDate?: Date | null;

    @Field({ nullable: true })
    WebsiteUrl?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Members
//****************************************************************************
@ObjectType()
export class RunYourMembershipMemberViewResult {
    @Field(() => [YourMembershipMember_])
    Results: YourMembershipMember_[];

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

@Resolver(YourMembershipMember_)
export class YourMembershipMemberResolver extends ResolverBase {
    @Query(() => RunYourMembershipMemberViewResult)
    async RunYourMembershipMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberViewResult)
    async RunYourMembershipMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMemberViewResult)
    async RunYourMembershipMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMember_, { nullable: true })
    async YourMembershipMember(@Arg('ProfileID', () => Int) ProfileID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMember_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembers')} WHERE ${provider.QuoteIdentifier('ProfileID')}=${ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Members', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipMemberGroupBulk_])
    async YourMembershipMemberGroupBulks_WebSiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Group Bulks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberGroupBulks')} WHERE ${provider.QuoteIdentifier('WebSiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Group Bulks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Group Bulks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberReferral_])
    async YourMembershipMemberReferrals_ReferredIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Referrals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberReferrals')} WHERE ${provider.QuoteIdentifier('ReferredID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Referrals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Referrals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipCertificationJournal_])
    async YourMembershipCertificationJournals_WebsiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Journals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwCertificationJournals')} WHERE ${provider.QuoteIdentifier('WebsiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Journals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certification Journals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDuesTransaction_])
    async YourMembershipDuesTransactions_WebsiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dues Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDuesTransactions')} WHERE ${provider.QuoteIdentifier('WebsiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Dues Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dues Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberSubAccount_])
    async YourMembershipMemberSubAccounts_IDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Sub Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberSubAccounts')} WHERE ${provider.QuoteIdentifier('ID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Sub Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Sub Accounts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberReferral_])
    async YourMembershipMemberReferrals_ReferrerIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Referrals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberReferrals')} WHERE ${provider.QuoteIdentifier('ReferrerID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Referrals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Referrals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipDonationTransaction_])
    async YourMembershipDonationTransactions_WebsiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donation Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwDonationTransactions')} WHERE ${provider.QuoteIdentifier('WebsiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Donation Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donation Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMemberSubAccount_])
    async YourMembershipMemberSubAccounts_ParentIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Sub Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberSubAccounts')} WHERE ${provider.QuoteIdentifier('ParentID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Member Sub Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Sub Accounts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipStoreOrder_])
    async YourMembershipStoreOrders_WebsiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Store Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrders')} WHERE ${provider.QuoteIdentifier('WebsiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Store Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipStoreOrderDetail_])
    async YourMembershipStoreOrderDetails_WebsiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Store Order Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrderDetails')} WHERE ${provider.QuoteIdentifier('WebsiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Order Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Store Order Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipInvoiceItem_])
    async YourMembershipInvoiceItems_WebSiteMemberIDArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwInvoiceItems')} WHERE ${provider.QuoteIdentifier('WebSiteMemberID')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotQuote_])
    async HubSpotQuotes_hs_sender_emailArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Quotes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuotes')} WHERE ${provider.QuoteIdentifier('hs_sender_email')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Quotes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Quotes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotEmail_])
    async HubSpotEmails_hs_email_sender_emailArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwEmails')} WHERE ${provider.QuoteIdentifier('hs_email_sender_email')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotEmail_])
    async HubSpotEmails_hs_email_sender_firstnameArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwEmails')} WHERE ${provider.QuoteIdentifier('hs_email_sender_firstname')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotEmail_])
    async HubSpotEmails_hs_email_sender_lastnameArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwEmails')} WHERE ${provider.QuoteIdentifier('hs_email_sender_lastname')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotEmail_])
    async HubSpotEmails_hs_email_to_emailArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwEmails')} WHERE ${provider.QuoteIdentifier('hs_email_to_email')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompany_])
    async HubSpotCompanies_cityArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('city')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompany_])
    async HubSpotCompanies_addressArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('address')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_emailArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('email')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompany_])
    async HubSpotCompanies_address2Array(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('address2')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_lastnameArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('lastname')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompany_])
    async HubSpotCompanies_phoneArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('phone')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_countryArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('country')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompany_])
    async HubSpotCompanies_stateArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('state')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_firstnameArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('firstname')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompany_])
    async HubSpotCompanies_countryArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanies')} WHERE ${provider.QuoteIdentifier('country')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Companies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_cityArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('city')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_stateArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('state')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContact_])
    async HubSpotContacts_phoneArray(@Root() yourmembershipmember_: YourMembershipMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContacts')} WHERE ${provider.QuoteIdentifier('phone')}=${yourmembershipmember_.ProfileID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipMember_)
    async CreateYourMembershipMember(
        @Arg('input', () => CreateYourMembershipMemberInput) input: CreateYourMembershipMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMember_)
    async UpdateYourMembershipMember(
        @Arg('input', () => UpdateYourMembershipMemberInput) input: UpdateYourMembershipMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMember_)
    async DeleteYourMembershipMember(@Arg('ProfileID', () => Int) ProfileID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ProfileID', Value: ProfileID}]);
        return this.DeleteRecord('Members', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Membership Modifiers
//****************************************************************************
@ObjectType({ description: `Price modifier rules per membership plan (discounts, surcharges)` })
export class YourMembershipMembershipModifier_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    MembershipID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field(() => Float, {nullable: true}) 
    Amount?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Membership Modifiers
//****************************************************************************
@InputType()
export class CreateYourMembershipMembershipModifierInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    MembershipID: number | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Membership Modifiers
//****************************************************************************
@InputType()
export class UpdateYourMembershipMembershipModifierInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    MembershipID?: number | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Membership Modifiers
//****************************************************************************
@ObjectType()
export class RunYourMembershipMembershipModifierViewResult {
    @Field(() => [YourMembershipMembershipModifier_])
    Results: YourMembershipMembershipModifier_[];

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

@Resolver(YourMembershipMembershipModifier_)
export class YourMembershipMembershipModifierResolver extends ResolverBase {
    @Query(() => RunYourMembershipMembershipModifierViewResult)
    async RunYourMembershipMembershipModifierViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMembershipModifierViewResult)
    async RunYourMembershipMembershipModifierViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMembershipModifierViewResult)
    async RunYourMembershipMembershipModifierDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Membership Modifiers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMembershipModifier_, { nullable: true })
    async YourMembershipMembershipModifier(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMembershipModifier_ | null> {
        this.CheckUserReadPermissions('Membership Modifiers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembershipModifiers')} WHERE ${provider.QuoteIdentifier('ID')}=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Modifiers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Membership Modifiers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMembershipModifier_)
    async CreateYourMembershipMembershipModifier(
        @Arg('input', () => CreateYourMembershipMembershipModifierInput) input: CreateYourMembershipMembershipModifierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Membership Modifiers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMembershipModifier_)
    async UpdateYourMembershipMembershipModifier(
        @Arg('input', () => UpdateYourMembershipMembershipModifierInput) input: UpdateYourMembershipMembershipModifierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Membership Modifiers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMembershipModifier_)
    async DeleteYourMembershipMembershipModifier(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Membership Modifiers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Membership Promo Codes
//****************************************************************************
@ObjectType({ description: `Promotional discount codes per membership plan with usage limits and expiration` })
export class YourMembershipMembershipPromoCode_ {
    @Field(() => Int) 
    PromoCodeId: number;
        
    @Field(() => Int, {nullable: true}) 
    MembershipID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FriendlyName?: string;
        
    @Field(() => Float, {nullable: true}) 
    DiscountAmount?: number;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    UsageLimit?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Membership Promo Codes
//****************************************************************************
@InputType()
export class CreateYourMembershipMembershipPromoCodeInput {
    @Field(() => Int, { nullable: true })
    PromoCodeId?: number;

    @Field(() => Int, { nullable: true })
    MembershipID: number | null;

    @Field({ nullable: true })
    FriendlyName: string | null;

    @Field(() => Float, { nullable: true })
    DiscountAmount: number | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field(() => Int, { nullable: true })
    UsageLimit: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Membership Promo Codes
//****************************************************************************
@InputType()
export class UpdateYourMembershipMembershipPromoCodeInput {
    @Field(() => Int)
    PromoCodeId: number;

    @Field(() => Int, { nullable: true })
    MembershipID?: number | null;

    @Field({ nullable: true })
    FriendlyName?: string | null;

    @Field(() => Float, { nullable: true })
    DiscountAmount?: number | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field(() => Int, { nullable: true })
    UsageLimit?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Membership Promo Codes
//****************************************************************************
@ObjectType()
export class RunYourMembershipMembershipPromoCodeViewResult {
    @Field(() => [YourMembershipMembershipPromoCode_])
    Results: YourMembershipMembershipPromoCode_[];

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

@Resolver(YourMembershipMembershipPromoCode_)
export class YourMembershipMembershipPromoCodeResolver extends ResolverBase {
    @Query(() => RunYourMembershipMembershipPromoCodeViewResult)
    async RunYourMembershipMembershipPromoCodeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMembershipPromoCodeViewResult)
    async RunYourMembershipMembershipPromoCodeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMembershipPromoCodeViewResult)
    async RunYourMembershipMembershipPromoCodeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Membership Promo Codes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMembershipPromoCode_, { nullable: true })
    async YourMembershipMembershipPromoCode(@Arg('PromoCodeId', () => Int) PromoCodeId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMembershipPromoCode_ | null> {
        this.CheckUserReadPermissions('Membership Promo Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembershipPromoCodes')} WHERE ${provider.QuoteIdentifier('PromoCodeId')}=${PromoCodeId} ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Promo Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Membership Promo Codes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipMembershipPromoCode_)
    async CreateYourMembershipMembershipPromoCode(
        @Arg('input', () => CreateYourMembershipMembershipPromoCodeInput) input: CreateYourMembershipMembershipPromoCodeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Membership Promo Codes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMembershipPromoCode_)
    async UpdateYourMembershipMembershipPromoCode(
        @Arg('input', () => UpdateYourMembershipMembershipPromoCodeInput) input: UpdateYourMembershipMembershipPromoCodeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Membership Promo Codes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMembershipPromoCode_)
    async DeleteYourMembershipMembershipPromoCode(@Arg('PromoCodeId', () => Int) PromoCodeId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'PromoCodeId', Value: PromoCodeId}]);
        return this.DeleteRecord('Membership Promo Codes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Memberships
//****************************************************************************
@ObjectType({ description: `Membership plans with dues amounts, proration rules, and invoice settings` })
export class YourMembershipMembership_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Float, {nullable: true}) 
    DuesAmount?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    ProRatedDues?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    AllowMultipleOpenInvoices?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipMembershipModifier_])
    YourMembershipMembershipModifiers_MembershipIDArray: YourMembershipMembershipModifier_[]; // Link to YourMembershipMembershipModifiers
    
    @Field(() => [YourMembershipMembershipPromoCode_])
    YourMembershipMembershipPromoCodes_MembershipIDArray: YourMembershipMembershipPromoCode_[]; // Link to YourMembershipMembershipPromoCodes
    
}

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class CreateYourMembershipMembershipInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    Code: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Float, { nullable: true })
    DuesAmount: number | null;

    @Field(() => Boolean, { nullable: true })
    ProRatedDues: boolean | null;

    @Field(() => Boolean, { nullable: true })
    AllowMultipleOpenInvoices: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class UpdateYourMembershipMembershipInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    Code?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Float, { nullable: true })
    DuesAmount?: number | null;

    @Field(() => Boolean, { nullable: true })
    ProRatedDues?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    AllowMultipleOpenInvoices?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Memberships
//****************************************************************************
@ObjectType()
export class RunYourMembershipMembershipViewResult {
    @Field(() => [YourMembershipMembership_])
    Results: YourMembershipMembership_[];

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

@Resolver(YourMembershipMembership_)
export class YourMembershipMembershipResolver extends ResolverBase {
    @Query(() => RunYourMembershipMembershipViewResult)
    async RunYourMembershipMembershipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMembershipViewResult)
    async RunYourMembershipMembershipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipMembershipViewResult)
    async RunYourMembershipMembershipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipMembership_, { nullable: true })
    async YourMembershipMembership(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipMembership_ | null> {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Memberships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipMembershipModifier_])
    async YourMembershipMembershipModifiers_MembershipIDArray(@Root() yourmembershipmembership_: YourMembershipMembership_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Membership Modifiers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembershipModifiers')} WHERE ${provider.QuoteIdentifier('MembershipID')}=${yourmembershipmembership_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Modifiers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Membership Modifiers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipMembershipPromoCode_])
    async YourMembershipMembershipPromoCodes_MembershipIDArray(@Root() yourmembershipmembership_: YourMembershipMembership_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Membership Promo Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwMembershipPromoCodes')} WHERE ${provider.QuoteIdentifier('MembershipID')}=${yourmembershipmembership_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Promo Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Membership Promo Codes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipMembership_)
    async CreateYourMembershipMembership(
        @Arg('input', () => CreateYourMembershipMembershipInput) input: CreateYourMembershipMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipMembership_)
    async UpdateYourMembershipMembership(
        @Arg('input', () => UpdateYourMembershipMembershipInput) input: UpdateYourMembershipMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipMembership_)
    async DeleteYourMembershipMembership(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Notes
//****************************************************************************
@ObjectType({ description: `Notes and annotations attached to CRM records` })
export class HubSpotNote_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    hs_note_body?: string;
        
    @Field({nullable: true}) 
    hs_timestamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_attachment_ids?: string;
        
    @Field({nullable: true}) 
    hs_body_preview?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    hs_body_preview_is_truncated?: boolean;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotDealNote_])
    HubSpotDealNotes_note_idArray: HubSpotDealNote_[]; // Link to HubSpotDealNotes
    
    @Field(() => [HubSpotCompanyNote_])
    HubSpotCompanyNotes_note_idArray: HubSpotCompanyNote_[]; // Link to HubSpotCompanyNotes
    
    @Field(() => [HubSpotTicketNote_])
    HubSpotTicketNotes_note_idArray: HubSpotTicketNote_[]; // Link to HubSpotTicketNotes
    
    @Field(() => [HubSpotContactNote_])
    HubSpotContactNotes_note_idArray: HubSpotContactNote_[]; // Link to HubSpotContactNotes
    
}

//****************************************************************************
// INPUT TYPE for Notes
//****************************************************************************
@InputType()
export class CreateHubSpotNoteInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_note_body: string | null;

    @Field({ nullable: true })
    hs_timestamp: Date | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    hs_attachment_ids: string | null;

    @Field({ nullable: true })
    hs_body_preview: string | null;

    @Field(() => Boolean, { nullable: true })
    hs_body_preview_is_truncated: boolean | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Notes
//****************************************************************************
@InputType()
export class UpdateHubSpotNoteInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_note_body?: string | null;

    @Field({ nullable: true })
    hs_timestamp?: Date | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    hs_attachment_ids?: string | null;

    @Field({ nullable: true })
    hs_body_preview?: string | null;

    @Field(() => Boolean, { nullable: true })
    hs_body_preview_is_truncated?: boolean | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Notes
//****************************************************************************
@ObjectType()
export class RunHubSpotNoteViewResult {
    @Field(() => [HubSpotNote_])
    Results: HubSpotNote_[];

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

@Resolver(HubSpotNote_)
export class HubSpotNoteResolver extends ResolverBase {
    @Query(() => RunHubSpotNoteViewResult)
    async RunHubSpotNoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotNoteViewResult)
    async RunHubSpotNoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotNoteViewResult)
    async RunHubSpotNoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Notes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotNote_, { nullable: true })
    async HubSpotNote(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotNote_ | null> {
        this.CheckUserReadPermissions('Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwNotes')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Notes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotDealNote_])
    async HubSpotDealNotes_note_idArray(@Root() hubspotnote_: HubSpotNote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealNotes')} WHERE ${provider.QuoteIdentifier('note_id')}='${hubspotnote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyNote_])
    async HubSpotCompanyNotes_note_idArray(@Root() hubspotnote_: HubSpotNote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyNotes')} WHERE ${provider.QuoteIdentifier('note_id')}='${hubspotnote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketNote_])
    async HubSpotTicketNotes_note_idArray(@Root() hubspotnote_: HubSpotNote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketNotes')} WHERE ${provider.QuoteIdentifier('note_id')}='${hubspotnote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactNote_])
    async HubSpotContactNotes_note_idArray(@Root() hubspotnote_: HubSpotNote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactNotes')} WHERE ${provider.QuoteIdentifier('note_id')}='${hubspotnote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotNote_)
    async CreateHubSpotNote(
        @Arg('input', () => CreateHubSpotNoteInput) input: CreateHubSpotNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Notes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotNote_)
    async UpdateHubSpotNote(
        @Arg('input', () => UpdateHubSpotNoteInput) input: UpdateHubSpotNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Notes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotNote_)
    async DeleteHubSpotNote(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Notes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payment Processors
//****************************************************************************
@ObjectType({ description: `Configured payment processors with active/primary status and card order types` })
export class YourMembershipPaymentProcessor_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Active?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Primary?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CardOrderType?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Payment Processors
//****************************************************************************
@InputType()
export class CreateYourMembershipPaymentProcessorInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Boolean, { nullable: true })
    Active: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Primary: boolean | null;

    @Field({ nullable: true })
    CardOrderType: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Payment Processors
//****************************************************************************
@InputType()
export class UpdateYourMembershipPaymentProcessorInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Boolean, { nullable: true })
    Active?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Primary?: boolean | null;

    @Field({ nullable: true })
    CardOrderType?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payment Processors
//****************************************************************************
@ObjectType()
export class RunYourMembershipPaymentProcessorViewResult {
    @Field(() => [YourMembershipPaymentProcessor_])
    Results: YourMembershipPaymentProcessor_[];

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

@Resolver(YourMembershipPaymentProcessor_)
export class YourMembershipPaymentProcessorResolver extends ResolverBase {
    @Query(() => RunYourMembershipPaymentProcessorViewResult)
    async RunYourMembershipPaymentProcessorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipPaymentProcessorViewResult)
    async RunYourMembershipPaymentProcessorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipPaymentProcessorViewResult)
    async RunYourMembershipPaymentProcessorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payment Processors';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipPaymentProcessor_, { nullable: true })
    async YourMembershipPaymentProcessor(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipPaymentProcessor_ | null> {
        this.CheckUserReadPermissions('Payment Processors', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwPaymentProcessors')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Payment Processors', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Payment Processors', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipPaymentProcessor_)
    async CreateYourMembershipPaymentProcessor(
        @Arg('input', () => CreateYourMembershipPaymentProcessorInput) input: CreateYourMembershipPaymentProcessorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payment Processors', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipPaymentProcessor_)
    async UpdateYourMembershipPaymentProcessor(
        @Arg('input', () => UpdateYourMembershipPaymentProcessorInput) input: UpdateYourMembershipPaymentProcessorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payment Processors', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipPaymentProcessor_)
    async DeleteYourMembershipPaymentProcessor(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Payment Processors', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Person IDs
//****************************************************************************
@ObjectType({ description: `Member and non-member identity records for data synchronization with timestamp support` })
export class YourMembershipPersonID_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    UserType?: string;
        
    @Field({nullable: true}) 
    DateRegistered?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Person IDs
//****************************************************************************
@InputType()
export class CreateYourMembershipPersonIDInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    UserType: string | null;

    @Field({ nullable: true })
    DateRegistered: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Person IDs
//****************************************************************************
@InputType()
export class UpdateYourMembershipPersonIDInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    UserType?: string | null;

    @Field({ nullable: true })
    DateRegistered?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Person IDs
//****************************************************************************
@ObjectType()
export class RunYourMembershipPersonIDViewResult {
    @Field(() => [YourMembershipPersonID_])
    Results: YourMembershipPersonID_[];

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

@Resolver(YourMembershipPersonID_)
export class YourMembershipPersonIDResolver extends ResolverBase {
    @Query(() => RunYourMembershipPersonIDViewResult)
    async RunYourMembershipPersonIDViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipPersonIDViewResult)
    async RunYourMembershipPersonIDViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipPersonIDViewResult)
    async RunYourMembershipPersonIDDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Person IDs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipPersonID_, { nullable: true })
    async YourMembershipPersonID(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipPersonID_ | null> {
        this.CheckUserReadPermissions('Person IDs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwPersonIDs')} WHERE ${provider.QuoteIdentifier('ID')}=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Person IDs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Person IDs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipPersonID_)
    async CreateYourMembershipPersonID(
        @Arg('input', () => CreateYourMembershipPersonIDInput) input: CreateYourMembershipPersonIDInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Person IDs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipPersonID_)
    async UpdateYourMembershipPersonID(
        @Arg('input', () => UpdateYourMembershipPersonIDInput) input: UpdateYourMembershipPersonIDInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Person IDs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipPersonID_)
    async DeleteYourMembershipPersonID(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Person IDs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Product Categories
//****************************************************************************
@ObjectType({ description: `Categories for organizing store products` })
export class YourMembershipProductCategory_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Product Categories
//****************************************************************************
@InputType()
export class CreateYourMembershipProductCategoryInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Product Categories
//****************************************************************************
@InputType()
export class UpdateYourMembershipProductCategoryInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Product Categories
//****************************************************************************
@ObjectType()
export class RunYourMembershipProductCategoryViewResult {
    @Field(() => [YourMembershipProductCategory_])
    Results: YourMembershipProductCategory_[];

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

@Resolver(YourMembershipProductCategory_)
export class YourMembershipProductCategoryResolver extends ResolverBase {
    @Query(() => RunYourMembershipProductCategoryViewResult)
    async RunYourMembershipProductCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipProductCategoryViewResult)
    async RunYourMembershipProductCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipProductCategoryViewResult)
    async RunYourMembershipProductCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Product Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipProductCategory_, { nullable: true })
    async YourMembershipProductCategory(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipProductCategory_ | null> {
        this.CheckUserReadPermissions('Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwProductCategories')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Product Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipProductCategory_)
    async CreateYourMembershipProductCategory(
        @Arg('input', () => CreateYourMembershipProductCategoryInput) input: CreateYourMembershipProductCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Product Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipProductCategory_)
    async UpdateYourMembershipProductCategory(
        @Arg('input', () => UpdateYourMembershipProductCategoryInput) input: UpdateYourMembershipProductCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Product Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipProductCategory_)
    async DeleteYourMembershipProductCategory(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Product Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products
//****************************************************************************
@ObjectType({ description: `Store products available for purchase with pricing, inventory, and tax info` })
export class YourMembershipProduct_ {
    @Field(() => Int) 
    id: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    description?: string;
        
    @Field(() => Float, {nullable: true}) 
    amount?: number;
        
    @Field(() => Float, {nullable: true}) 
    weight?: number;
        
    @Field(() => Float, {nullable: true}) 
    taxRate?: number;
        
    @Field(() => Int, {nullable: true}) 
    quantity?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    ProductActive?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsFeatured?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    ListInStore?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    taxable?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class CreateYourMembershipProductInput {
    @Field(() => Int, { nullable: true })
    id?: number;

    @Field({ nullable: true })
    description: string | null;

    @Field(() => Float, { nullable: true })
    amount: number | null;

    @Field(() => Float, { nullable: true })
    weight: number | null;

    @Field(() => Float, { nullable: true })
    taxRate: number | null;

    @Field(() => Int, { nullable: true })
    quantity: number | null;

    @Field(() => Boolean, { nullable: true })
    ProductActive: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsFeatured: boolean | null;

    @Field(() => Boolean, { nullable: true })
    ListInStore: boolean | null;

    @Field(() => Boolean, { nullable: true })
    taxable: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class UpdateYourMembershipProductInput {
    @Field(() => Int)
    id: number;

    @Field({ nullable: true })
    description?: string | null;

    @Field(() => Float, { nullable: true })
    amount?: number | null;

    @Field(() => Float, { nullable: true })
    weight?: number | null;

    @Field(() => Float, { nullable: true })
    taxRate?: number | null;

    @Field(() => Int, { nullable: true })
    quantity?: number | null;

    @Field(() => Boolean, { nullable: true })
    ProductActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsFeatured?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    ListInStore?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    taxable?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products
//****************************************************************************
@ObjectType()
export class RunYourMembershipProductViewResult {
    @Field(() => [YourMembershipProduct_])
    Results: YourMembershipProduct_[];

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

@Resolver(YourMembershipProduct_)
export class YourMembershipProductResolver extends ResolverBase {
    @Query(() => RunYourMembershipProductViewResult)
    async RunYourMembershipProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipProductViewResult)
    async RunYourMembershipProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipProductViewResult)
    async RunYourMembershipProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipProduct_, { nullable: true })
    async YourMembershipProduct(@Arg('id', () => Int) id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipProduct_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwProducts')} WHERE ${provider.QuoteIdentifier('id')}=${id} ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipProduct_)
    async CreateYourMembershipProduct(
        @Arg('input', () => CreateYourMembershipProductInput) input: CreateYourMembershipProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipProduct_)
    async UpdateYourMembershipProduct(
        @Arg('input', () => UpdateYourMembershipProductInput) input: UpdateYourMembershipProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipProduct_)
    async DeleteYourMembershipProduct(@Arg('id', () => Int) id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'id', Value: id}]);
        return this.DeleteRecord('Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products__HubSpot
//****************************************************************************
@ObjectType({ description: `Product catalog with pricing, SKU, and billing information` })
export class HubSpotProduct_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    name?: string;
        
    @Field({nullable: true}) 
    description?: string;
        
    @Field(() => Float, {nullable: true}) 
    price?: number;
        
    @Field(() => Float, {nullable: true}) 
    hs_cost_of_goods_sold?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_recurring_billing_period?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sku?: string;
        
    @Field(() => Float, {nullable: true}) 
    tax?: number;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotLineItem_])
    HubSpotLineItems_hs_product_idArray: HubSpotLineItem_[]; // Link to HubSpotLineItems
    
}

//****************************************************************************
// INPUT TYPE for Products__HubSpot
//****************************************************************************
@InputType()
export class CreateHubSpotProductInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    name: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field(() => Float, { nullable: true })
    price: number | null;

    @Field(() => Float, { nullable: true })
    hs_cost_of_goods_sold: number | null;

    @Field({ nullable: true })
    hs_recurring_billing_period: string | null;

    @Field({ nullable: true })
    hs_sku: string | null;

    @Field(() => Float, { nullable: true })
    tax: number | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Products__HubSpot
//****************************************************************************
@InputType()
export class UpdateHubSpotProductInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    name?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field(() => Float, { nullable: true })
    price?: number | null;

    @Field(() => Float, { nullable: true })
    hs_cost_of_goods_sold?: number | null;

    @Field({ nullable: true })
    hs_recurring_billing_period?: string | null;

    @Field({ nullable: true })
    hs_sku?: string | null;

    @Field(() => Float, { nullable: true })
    tax?: number | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products__HubSpot
//****************************************************************************
@ObjectType()
export class RunHubSpotProductViewResult {
    @Field(() => [HubSpotProduct_])
    Results: HubSpotProduct_[];

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

@Resolver(HubSpotProduct_)
export class HubSpotProductResolver extends ResolverBase {
    @Query(() => RunHubSpotProductViewResult)
    async RunHubSpotProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotProductViewResult)
    async RunHubSpotProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotProductViewResult)
    async RunHubSpotProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products__HubSpot';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotProduct_, { nullable: true })
    async HubSpotProduct(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotProduct_ | null> {
        this.CheckUserReadPermissions('Products__HubSpot', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwProducts__HubSpot')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products__HubSpot', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Products__HubSpot', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotLineItem_])
    async HubSpotLineItems_hs_product_idArray(@Root() hubspotproduct_: HubSpotProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwLineItems')} WHERE ${provider.QuoteIdentifier('hs_product_id')}='${hubspotproduct_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Line Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotProduct_)
    async CreateHubSpotProduct(
        @Arg('input', () => CreateHubSpotProductInput) input: CreateHubSpotProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products__HubSpot', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotProduct_)
    async UpdateHubSpotProduct(
        @Arg('input', () => UpdateHubSpotProductInput) input: UpdateHubSpotProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products__HubSpot', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotProduct_)
    async DeleteHubSpotProduct(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Products__HubSpot', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for QB Classes
//****************************************************************************
@ObjectType({ description: `QuickBooks class definitions for accounting integration and financial categorization` })
export class YourMembershipQBClass_ {
    @Field(() => Int) 
    Id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipInvoiceItem_])
    YourMembershipInvoiceItems_QBClassItemNameArray: YourMembershipInvoiceItem_[]; // Link to YourMembershipInvoiceItems
    
}

//****************************************************************************
// INPUT TYPE for QB Classes
//****************************************************************************
@InputType()
export class CreateYourMembershipQBClassInput {
    @Field(() => Int, { nullable: true })
    Id?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for QB Classes
//****************************************************************************
@InputType()
export class UpdateYourMembershipQBClassInput {
    @Field(() => Int)
    Id: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for QB Classes
//****************************************************************************
@ObjectType()
export class RunYourMembershipQBClassViewResult {
    @Field(() => [YourMembershipQBClass_])
    Results: YourMembershipQBClass_[];

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

@Resolver(YourMembershipQBClass_)
export class YourMembershipQBClassResolver extends ResolverBase {
    @Query(() => RunYourMembershipQBClassViewResult)
    async RunYourMembershipQBClassViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipQBClassViewResult)
    async RunYourMembershipQBClassViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipQBClassViewResult)
    async RunYourMembershipQBClassDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'QB Classes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipQBClass_, { nullable: true })
    async YourMembershipQBClass(@Arg('Id', () => Int) Id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipQBClass_ | null> {
        this.CheckUserReadPermissions('QB Classes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwQBClasses')} WHERE ${provider.QuoteIdentifier('Id')}=${Id} ` + this.getRowLevelSecurityWhereClause(provider, 'QB Classes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('QB Classes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipInvoiceItem_])
    async YourMembershipInvoiceItems_QBClassItemNameArray(@Root() yourmembershipqbclass_: YourMembershipQBClass_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwInvoiceItems')} WHERE ${provider.QuoteIdentifier('QBClassItemName')}=${yourmembershipqbclass_.Id} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipQBClass_)
    async CreateYourMembershipQBClass(
        @Arg('input', () => CreateYourMembershipQBClassInput) input: CreateYourMembershipQBClassInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('QB Classes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipQBClass_)
    async UpdateYourMembershipQBClass(
        @Arg('input', () => UpdateYourMembershipQBClassInput) input: UpdateYourMembershipQBClassInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('QB Classes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipQBClass_)
    async DeleteYourMembershipQBClass(@Arg('Id', () => Int) Id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('QB Classes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Quote Contacts
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between quotes and contacts` })
export class HubSpotQuoteContact_ {
    @Field({description: `HubSpot Quote hs_object_id`}) 
    @MaxLength(100)
    quote_id: string;
        
    @Field({description: `HubSpot Contact hs_object_id`}) 
    @MaxLength(100)
    contact_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Quote Contacts
//****************************************************************************
@InputType()
export class CreateHubSpotQuoteContactInput {
    @Field({ nullable: true })
    quote_id?: string;

    @Field({ nullable: true })
    contact_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Quote Contacts
//****************************************************************************
@InputType()
export class UpdateHubSpotQuoteContactInput {
    @Field()
    quote_id: string;

    @Field()
    contact_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Quote Contacts
//****************************************************************************
@ObjectType()
export class RunHubSpotQuoteContactViewResult {
    @Field(() => [HubSpotQuoteContact_])
    Results: HubSpotQuoteContact_[];

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

@Resolver(HubSpotQuoteContact_)
export class HubSpotQuoteContactResolver extends ResolverBase {
    @Query(() => RunHubSpotQuoteContactViewResult)
    async RunHubSpotQuoteContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotQuoteContactViewResult)
    async RunHubSpotQuoteContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotQuoteContactViewResult)
    async RunHubSpotQuoteContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Quote Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotQuoteContact_, { nullable: true })
    async HubSpotQuoteContact(@Arg('quote_id', () => String) quote_id: string, @Arg('contact_id', () => String) contact_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotQuoteContact_ | null> {
        this.CheckUserReadPermissions('Quote Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuoteContacts')} WHERE ${provider.QuoteIdentifier('quote_id')}='${quote_id}' AND ${provider.QuoteIdentifier('contact_id')}='${contact_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quote Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Quote Contacts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotQuoteContact_)
    async CreateHubSpotQuoteContact(
        @Arg('input', () => CreateHubSpotQuoteContactInput) input: CreateHubSpotQuoteContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Quote Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotQuoteContact_)
    async UpdateHubSpotQuoteContact(
        @Arg('input', () => UpdateHubSpotQuoteContactInput) input: UpdateHubSpotQuoteContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Quote Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotQuoteContact_)
    async DeleteHubSpotQuoteContact(@Arg('quote_id', () => String) quote_id: string, @Arg('contact_id', () => String) contact_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'quote_id', Value: quote_id}, {FieldName: 'contact_id', Value: contact_id}]);
        return this.DeleteRecord('Quote Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Quote Line Items
//****************************************************************************
@ObjectType({ description: `Many-to-many associations between quotes and line items` })
export class HubSpotQuoteLineItem_ {
    @Field({description: `HubSpot Quote hs_object_id`}) 
    @MaxLength(100)
    quote_id: string;
        
    @Field({description: `HubSpot LineItem hs_object_id`}) 
    @MaxLength(100)
    line_item_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Quote Line Items
//****************************************************************************
@InputType()
export class CreateHubSpotQuoteLineItemInput {
    @Field({ nullable: true })
    quote_id?: string;

    @Field({ nullable: true })
    line_item_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Quote Line Items
//****************************************************************************
@InputType()
export class UpdateHubSpotQuoteLineItemInput {
    @Field()
    quote_id: string;

    @Field()
    line_item_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Quote Line Items
//****************************************************************************
@ObjectType()
export class RunHubSpotQuoteLineItemViewResult {
    @Field(() => [HubSpotQuoteLineItem_])
    Results: HubSpotQuoteLineItem_[];

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

@Resolver(HubSpotQuoteLineItem_)
export class HubSpotQuoteLineItemResolver extends ResolverBase {
    @Query(() => RunHubSpotQuoteLineItemViewResult)
    async RunHubSpotQuoteLineItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotQuoteLineItemViewResult)
    async RunHubSpotQuoteLineItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotQuoteLineItemViewResult)
    async RunHubSpotQuoteLineItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Quote Line Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotQuoteLineItem_, { nullable: true })
    async HubSpotQuoteLineItem(@Arg('quote_id', () => String) quote_id: string, @Arg('line_item_id', () => String) line_item_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotQuoteLineItem_ | null> {
        this.CheckUserReadPermissions('Quote Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuoteLineItems')} WHERE ${provider.QuoteIdentifier('quote_id')}='${quote_id}' AND ${provider.QuoteIdentifier('line_item_id')}='${line_item_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quote Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Quote Line Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotQuoteLineItem_)
    async CreateHubSpotQuoteLineItem(
        @Arg('input', () => CreateHubSpotQuoteLineItemInput) input: CreateHubSpotQuoteLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Quote Line Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotQuoteLineItem_)
    async UpdateHubSpotQuoteLineItem(
        @Arg('input', () => UpdateHubSpotQuoteLineItemInput) input: UpdateHubSpotQuoteLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Quote Line Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotQuoteLineItem_)
    async DeleteHubSpotQuoteLineItem(@Arg('quote_id', () => String) quote_id: string, @Arg('line_item_id', () => String) line_item_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'quote_id', Value: quote_id}, {FieldName: 'line_item_id', Value: line_item_id}]);
        return this.DeleteRecord('Quote Line Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Quotes
//****************************************************************************
@ObjectType({ description: `Sales quotes with pricing, sender details, and expiration tracking` })
export class HubSpotQuote_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_title?: string;
        
    @Field({nullable: true}) 
    hs_expiration_date?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_status?: string;
        
    @Field(() => Float, {nullable: true}) 
    hs_quote_amount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_currency?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sender_firstname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sender_lastname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sender_email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_sender_company_name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_language?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_locale?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_slug?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_public_url_key?: string;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotDealQuote_])
    HubSpotDealQuotes_quote_idArray: HubSpotDealQuote_[]; // Link to HubSpotDealQuotes
    
    @Field(() => [HubSpotQuoteContact_])
    HubSpotQuoteContacts_quote_idArray: HubSpotQuoteContact_[]; // Link to HubSpotQuoteContacts
    
    @Field(() => [HubSpotQuoteLineItem_])
    HubSpotQuoteLineItems_quote_idArray: HubSpotQuoteLineItem_[]; // Link to HubSpotQuoteLineItems
    
}

//****************************************************************************
// INPUT TYPE for Quotes
//****************************************************************************
@InputType()
export class CreateHubSpotQuoteInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_title: string | null;

    @Field({ nullable: true })
    hs_expiration_date: Date | null;

    @Field({ nullable: true })
    hs_status: string | null;

    @Field(() => Float, { nullable: true })
    hs_quote_amount: number | null;

    @Field({ nullable: true })
    hs_currency: string | null;

    @Field({ nullable: true })
    hs_sender_firstname: string | null;

    @Field({ nullable: true })
    hs_sender_lastname: string | null;

    @Field({ nullable: true })
    hs_sender_email: string | null;

    @Field({ nullable: true })
    hs_sender_company_name: string | null;

    @Field({ nullable: true })
    hs_language: string | null;

    @Field({ nullable: true })
    hs_locale: string | null;

    @Field({ nullable: true })
    hs_slug: string | null;

    @Field({ nullable: true })
    hs_public_url_key: string | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Quotes
//****************************************************************************
@InputType()
export class UpdateHubSpotQuoteInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_title?: string | null;

    @Field({ nullable: true })
    hs_expiration_date?: Date | null;

    @Field({ nullable: true })
    hs_status?: string | null;

    @Field(() => Float, { nullable: true })
    hs_quote_amount?: number | null;

    @Field({ nullable: true })
    hs_currency?: string | null;

    @Field({ nullable: true })
    hs_sender_firstname?: string | null;

    @Field({ nullable: true })
    hs_sender_lastname?: string | null;

    @Field({ nullable: true })
    hs_sender_email?: string | null;

    @Field({ nullable: true })
    hs_sender_company_name?: string | null;

    @Field({ nullable: true })
    hs_language?: string | null;

    @Field({ nullable: true })
    hs_locale?: string | null;

    @Field({ nullable: true })
    hs_slug?: string | null;

    @Field({ nullable: true })
    hs_public_url_key?: string | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Quotes
//****************************************************************************
@ObjectType()
export class RunHubSpotQuoteViewResult {
    @Field(() => [HubSpotQuote_])
    Results: HubSpotQuote_[];

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

@Resolver(HubSpotQuote_)
export class HubSpotQuoteResolver extends ResolverBase {
    @Query(() => RunHubSpotQuoteViewResult)
    async RunHubSpotQuoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotQuoteViewResult)
    async RunHubSpotQuoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotQuoteViewResult)
    async RunHubSpotQuoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Quotes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotQuote_, { nullable: true })
    async HubSpotQuote(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotQuote_ | null> {
        this.CheckUserReadPermissions('Quotes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuotes')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quotes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Quotes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotDealQuote_])
    async HubSpotDealQuotes_quote_idArray(@Root() hubspotquote_: HubSpotQuote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Quotes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealQuotes')} WHERE ${provider.QuoteIdentifier('quote_id')}='${hubspotquote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Quotes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Quotes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotQuoteContact_])
    async HubSpotQuoteContacts_quote_idArray(@Root() hubspotquote_: HubSpotQuote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Quote Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuoteContacts')} WHERE ${provider.QuoteIdentifier('quote_id')}='${hubspotquote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quote Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Quote Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotQuoteLineItem_])
    async HubSpotQuoteLineItems_quote_idArray(@Root() hubspotquote_: HubSpotQuote_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Quote Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwQuoteLineItems')} WHERE ${provider.QuoteIdentifier('quote_id')}='${hubspotquote_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Quote Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Quote Line Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotQuote_)
    async CreateHubSpotQuote(
        @Arg('input', () => CreateHubSpotQuoteInput) input: CreateHubSpotQuoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Quotes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotQuote_)
    async UpdateHubSpotQuote(
        @Arg('input', () => UpdateHubSpotQuoteInput) input: UpdateHubSpotQuoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Quotes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotQuote_)
    async DeleteHubSpotQuote(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Quotes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Shipping Methods
//****************************************************************************
@ObjectType({ description: `Shipping method definitions with base pricing and weight-based rates` })
export class YourMembershipShippingMethod_ {
    @Field(() => Int) 
    id: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    method?: string;
        
    @Field(() => Float, {nullable: true}) 
    basePrice?: number;
        
    @Field(() => Float, {nullable: true}) 
    pricePerWeightUnit?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    isDefault?: boolean;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipStoreOrder_])
    YourMembershipStoreOrders_ShippingMethodArray: YourMembershipStoreOrder_[]; // Link to YourMembershipStoreOrders
    
    @Field(() => [YourMembershipStoreOrderDetail_])
    YourMembershipStoreOrderDetails_ShippingMethodArray: YourMembershipStoreOrderDetail_[]; // Link to YourMembershipStoreOrderDetails
    
}

//****************************************************************************
// INPUT TYPE for Shipping Methods
//****************************************************************************
@InputType()
export class CreateYourMembershipShippingMethodInput {
    @Field(() => Int, { nullable: true })
    id?: number;

    @Field({ nullable: true })
    method: string | null;

    @Field(() => Float, { nullable: true })
    basePrice: number | null;

    @Field(() => Float, { nullable: true })
    pricePerWeightUnit: number | null;

    @Field(() => Boolean, { nullable: true })
    isDefault: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Shipping Methods
//****************************************************************************
@InputType()
export class UpdateYourMembershipShippingMethodInput {
    @Field(() => Int)
    id: number;

    @Field({ nullable: true })
    method?: string | null;

    @Field(() => Float, { nullable: true })
    basePrice?: number | null;

    @Field(() => Float, { nullable: true })
    pricePerWeightUnit?: number | null;

    @Field(() => Boolean, { nullable: true })
    isDefault?: boolean | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Shipping Methods
//****************************************************************************
@ObjectType()
export class RunYourMembershipShippingMethodViewResult {
    @Field(() => [YourMembershipShippingMethod_])
    Results: YourMembershipShippingMethod_[];

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

@Resolver(YourMembershipShippingMethod_)
export class YourMembershipShippingMethodResolver extends ResolverBase {
    @Query(() => RunYourMembershipShippingMethodViewResult)
    async RunYourMembershipShippingMethodViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipShippingMethodViewResult)
    async RunYourMembershipShippingMethodViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipShippingMethodViewResult)
    async RunYourMembershipShippingMethodDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Shipping Methods';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipShippingMethod_, { nullable: true })
    async YourMembershipShippingMethod(@Arg('id', () => Int) id: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipShippingMethod_ | null> {
        this.CheckUserReadPermissions('Shipping Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwShippingMethods')} WHERE ${provider.QuoteIdentifier('id')}=${id} ` + this.getRowLevelSecurityWhereClause(provider, 'Shipping Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Shipping Methods', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipStoreOrder_])
    async YourMembershipStoreOrders_ShippingMethodArray(@Root() yourmembershipshippingmethod_: YourMembershipShippingMethod_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Store Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrders')} WHERE ${provider.QuoteIdentifier('ShippingMethod')}=${yourmembershipshippingmethod_.id} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Store Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipStoreOrderDetail_])
    async YourMembershipStoreOrderDetails_ShippingMethodArray(@Root() yourmembershipshippingmethod_: YourMembershipShippingMethod_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Store Order Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrderDetails')} WHERE ${provider.QuoteIdentifier('ShippingMethod')}=${yourmembershipshippingmethod_.id} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Order Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Store Order Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipShippingMethod_)
    async CreateYourMembershipShippingMethod(
        @Arg('input', () => CreateYourMembershipShippingMethodInput) input: CreateYourMembershipShippingMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Shipping Methods', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipShippingMethod_)
    async UpdateYourMembershipShippingMethod(
        @Arg('input', () => UpdateYourMembershipShippingMethodInput) input: UpdateYourMembershipShippingMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Shipping Methods', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipShippingMethod_)
    async DeleteYourMembershipShippingMethod(@Arg('id', () => Int) id: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'id', Value: id}]);
        return this.DeleteRecord('Shipping Methods', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Sponsor Rotators
//****************************************************************************
@ObjectType({ description: `Sponsor advertisement rotator configurations with display settings` })
export class YourMembershipSponsorRotator_ {
    @Field(() => Int) 
    RotatorId: number;
        
    @Field(() => Boolean, {nullable: true}) 
    AutoScroll?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Random?: boolean;
        
    @Field({nullable: true}) 
    DateAdded?: Date;
        
    @Field(() => Int, {nullable: true}) 
    Mode?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Orientation?: string;
        
    @Field(() => Int, {nullable: true}) 
    SchoolId?: number;
        
    @Field(() => Int, {nullable: true}) 
    Speed?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Title?: string;
        
    @Field(() => Int, {nullable: true}) 
    ClientId?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Heading?: string;
        
    @Field(() => Int, {nullable: true}) 
    Height?: number;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Sponsor Rotators
//****************************************************************************
@InputType()
export class CreateYourMembershipSponsorRotatorInput {
    @Field(() => Int, { nullable: true })
    RotatorId?: number;

    @Field(() => Boolean, { nullable: true })
    AutoScroll: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Random: boolean | null;

    @Field({ nullable: true })
    DateAdded: Date | null;

    @Field(() => Int, { nullable: true })
    Mode: number | null;

    @Field({ nullable: true })
    Orientation: string | null;

    @Field(() => Int, { nullable: true })
    SchoolId: number | null;

    @Field(() => Int, { nullable: true })
    Speed: number | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field(() => Int, { nullable: true })
    ClientId: number | null;

    @Field({ nullable: true })
    Heading: string | null;

    @Field(() => Int, { nullable: true })
    Height: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Sponsor Rotators
//****************************************************************************
@InputType()
export class UpdateYourMembershipSponsorRotatorInput {
    @Field(() => Int)
    RotatorId: number;

    @Field(() => Boolean, { nullable: true })
    AutoScroll?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Random?: boolean | null;

    @Field({ nullable: true })
    DateAdded?: Date | null;

    @Field(() => Int, { nullable: true })
    Mode?: number | null;

    @Field({ nullable: true })
    Orientation?: string | null;

    @Field(() => Int, { nullable: true })
    SchoolId?: number | null;

    @Field(() => Int, { nullable: true })
    Speed?: number | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field(() => Int, { nullable: true })
    ClientId?: number | null;

    @Field({ nullable: true })
    Heading?: string | null;

    @Field(() => Int, { nullable: true })
    Height?: number | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Sponsor Rotators
//****************************************************************************
@ObjectType()
export class RunYourMembershipSponsorRotatorViewResult {
    @Field(() => [YourMembershipSponsorRotator_])
    Results: YourMembershipSponsorRotator_[];

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

@Resolver(YourMembershipSponsorRotator_)
export class YourMembershipSponsorRotatorResolver extends ResolverBase {
    @Query(() => RunYourMembershipSponsorRotatorViewResult)
    async RunYourMembershipSponsorRotatorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipSponsorRotatorViewResult)
    async RunYourMembershipSponsorRotatorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipSponsorRotatorViewResult)
    async RunYourMembershipSponsorRotatorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Sponsor Rotators';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipSponsorRotator_, { nullable: true })
    async YourMembershipSponsorRotator(@Arg('RotatorId', () => Int) RotatorId: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipSponsorRotator_ | null> {
        this.CheckUserReadPermissions('Sponsor Rotators', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwSponsorRotators')} WHERE ${provider.QuoteIdentifier('RotatorId')}=${RotatorId} ` + this.getRowLevelSecurityWhereClause(provider, 'Sponsor Rotators', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Sponsor Rotators', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipSponsorRotator_)
    async CreateYourMembershipSponsorRotator(
        @Arg('input', () => CreateYourMembershipSponsorRotatorInput) input: CreateYourMembershipSponsorRotatorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Sponsor Rotators', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipSponsorRotator_)
    async UpdateYourMembershipSponsorRotator(
        @Arg('input', () => UpdateYourMembershipSponsorRotatorInput) input: UpdateYourMembershipSponsorRotatorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Sponsor Rotators', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipSponsorRotator_)
    async DeleteYourMembershipSponsorRotator(@Arg('RotatorId', () => Int) RotatorId: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'RotatorId', Value: RotatorId}]);
        return this.DeleteRecord('Sponsor Rotators', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Store Order Details
//****************************************************************************
@ObjectType({ description: `Individual line items within store orders with product, pricing, and quantity details` })
export class YourMembershipStoreOrderDetail_ {
    @Field(() => Int) 
    OrderDetailID: number;
        
    @Field(() => Int, {nullable: true}) 
    OrderID?: number;
        
    @Field(() => Int, {nullable: true}) 
    WebsiteMemberID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ProductName?: string;
        
    @Field(() => Int, {nullable: true}) 
    Quantity?: number;
        
    @Field(() => Float, {nullable: true}) 
    UnitPrice?: number;
        
    @Field(() => Float, {nullable: true}) 
    TotalPrice?: number;
        
    @Field({nullable: true}) 
    OrderDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ShippingMethod?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Store Order Details
//****************************************************************************
@InputType()
export class CreateYourMembershipStoreOrderDetailInput {
    @Field(() => Int, { nullable: true })
    OrderDetailID?: number;

    @Field(() => Int, { nullable: true })
    OrderID: number | null;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID: number | null;

    @Field({ nullable: true })
    ProductName: string | null;

    @Field(() => Int, { nullable: true })
    Quantity: number | null;

    @Field(() => Float, { nullable: true })
    UnitPrice: number | null;

    @Field(() => Float, { nullable: true })
    TotalPrice: number | null;

    @Field({ nullable: true })
    OrderDate: Date | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    ShippingMethod: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Store Order Details
//****************************************************************************
@InputType()
export class UpdateYourMembershipStoreOrderDetailInput {
    @Field(() => Int)
    OrderDetailID: number;

    @Field(() => Int, { nullable: true })
    OrderID?: number | null;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID?: number | null;

    @Field({ nullable: true })
    ProductName?: string | null;

    @Field(() => Int, { nullable: true })
    Quantity?: number | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number | null;

    @Field(() => Float, { nullable: true })
    TotalPrice?: number | null;

    @Field({ nullable: true })
    OrderDate?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    ShippingMethod?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Store Order Details
//****************************************************************************
@ObjectType()
export class RunYourMembershipStoreOrderDetailViewResult {
    @Field(() => [YourMembershipStoreOrderDetail_])
    Results: YourMembershipStoreOrderDetail_[];

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

@Resolver(YourMembershipStoreOrderDetail_)
export class YourMembershipStoreOrderDetailResolver extends ResolverBase {
    @Query(() => RunYourMembershipStoreOrderDetailViewResult)
    async RunYourMembershipStoreOrderDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipStoreOrderDetailViewResult)
    async RunYourMembershipStoreOrderDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipStoreOrderDetailViewResult)
    async RunYourMembershipStoreOrderDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Store Order Details';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipStoreOrderDetail_, { nullable: true })
    async YourMembershipStoreOrderDetail(@Arg('OrderDetailID', () => Int) OrderDetailID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipStoreOrderDetail_ | null> {
        this.CheckUserReadPermissions('Store Order Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrderDetails')} WHERE ${provider.QuoteIdentifier('OrderDetailID')}=${OrderDetailID} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Order Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Store Order Details', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipStoreOrderDetail_)
    async CreateYourMembershipStoreOrderDetail(
        @Arg('input', () => CreateYourMembershipStoreOrderDetailInput) input: CreateYourMembershipStoreOrderDetailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Store Order Details', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipStoreOrderDetail_)
    async UpdateYourMembershipStoreOrderDetail(
        @Arg('input', () => UpdateYourMembershipStoreOrderDetailInput) input: UpdateYourMembershipStoreOrderDetailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Store Order Details', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipStoreOrderDetail_)
    async DeleteYourMembershipStoreOrderDetail(@Arg('OrderDetailID', () => Int) OrderDetailID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'OrderDetailID', Value: OrderDetailID}]);
        return this.DeleteRecord('Store Order Details', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Store Orders
//****************************************************************************
@ObjectType({ description: `Online store order headers with order date, status, and shipping info` })
export class YourMembershipStoreOrder_ {
    @Field(() => Int) 
    OrderID: number;
        
    @Field(() => Int, {nullable: true}) 
    WebsiteMemberID?: number;
        
    @Field({nullable: true}) 
    OrderDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Status?: string;
        
    @Field(() => Float, {nullable: true}) 
    TotalAmount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ShippingMethod?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    TrackingNumber?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [YourMembershipInvoiceItem_])
    YourMembershipInvoiceItems_InvoiceNoArray: YourMembershipInvoiceItem_[]; // Link to YourMembershipInvoiceItems
    
    @Field(() => [YourMembershipStoreOrderDetail_])
    YourMembershipStoreOrderDetails_OrderIDArray: YourMembershipStoreOrderDetail_[]; // Link to YourMembershipStoreOrderDetails
    
}

//****************************************************************************
// INPUT TYPE for Store Orders
//****************************************************************************
@InputType()
export class CreateYourMembershipStoreOrderInput {
    @Field(() => Int, { nullable: true })
    OrderID?: number;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID: number | null;

    @Field({ nullable: true })
    OrderDate: Date | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field(() => Float, { nullable: true })
    TotalAmount: number | null;

    @Field({ nullable: true })
    ShippingMethod: string | null;

    @Field({ nullable: true })
    TrackingNumber: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Store Orders
//****************************************************************************
@InputType()
export class UpdateYourMembershipStoreOrderInput {
    @Field(() => Int)
    OrderID: number;

    @Field(() => Int, { nullable: true })
    WebsiteMemberID?: number | null;

    @Field({ nullable: true })
    OrderDate?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number | null;

    @Field({ nullable: true })
    ShippingMethod?: string | null;

    @Field({ nullable: true })
    TrackingNumber?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Store Orders
//****************************************************************************
@ObjectType()
export class RunYourMembershipStoreOrderViewResult {
    @Field(() => [YourMembershipStoreOrder_])
    Results: YourMembershipStoreOrder_[];

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

@Resolver(YourMembershipStoreOrder_)
export class YourMembershipStoreOrderResolver extends ResolverBase {
    @Query(() => RunYourMembershipStoreOrderViewResult)
    async RunYourMembershipStoreOrderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipStoreOrderViewResult)
    async RunYourMembershipStoreOrderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipStoreOrderViewResult)
    async RunYourMembershipStoreOrderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Store Orders';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipStoreOrder_, { nullable: true })
    async YourMembershipStoreOrder(@Arg('OrderID', () => Int) OrderID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipStoreOrder_ | null> {
        this.CheckUserReadPermissions('Store Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrders')} WHERE ${provider.QuoteIdentifier('OrderID')}=${OrderID} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Store Orders', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [YourMembershipInvoiceItem_])
    async YourMembershipInvoiceItems_InvoiceNoArray(@Root() yourmembershipstoreorder_: YourMembershipStoreOrder_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwInvoiceItems')} WHERE ${provider.QuoteIdentifier('InvoiceNo')}=${yourmembershipstoreorder_.OrderID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [YourMembershipStoreOrderDetail_])
    async YourMembershipStoreOrderDetails_OrderIDArray(@Root() yourmembershipstoreorder_: YourMembershipStoreOrder_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Store Order Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwStoreOrderDetails')} WHERE ${provider.QuoteIdentifier('OrderID')}=${yourmembershipstoreorder_.OrderID} ` + this.getRowLevelSecurityWhereClause(provider, 'Store Order Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Store Order Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => YourMembershipStoreOrder_)
    async CreateYourMembershipStoreOrder(
        @Arg('input', () => CreateYourMembershipStoreOrderInput) input: CreateYourMembershipStoreOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Store Orders', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipStoreOrder_)
    async UpdateYourMembershipStoreOrder(
        @Arg('input', () => UpdateYourMembershipStoreOrderInput) input: UpdateYourMembershipStoreOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Store Orders', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipStoreOrder_)
    async DeleteYourMembershipStoreOrder(@Arg('OrderID', () => Int) OrderID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'OrderID', Value: OrderID}]);
        return this.DeleteRecord('Store Orders', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Tasks
//****************************************************************************
@ObjectType({ description: `To-do tasks with status, priority, and completion tracking` })
export class HubSpotTask_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_task_subject?: string;
        
    @Field({nullable: true}) 
    hs_task_body?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_task_status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_task_priority?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_task_type?: string;
        
    @Field({nullable: true}) 
    hs_timestamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    hs_task_completion_date?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_queue_membership_ids?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotContactTask_])
    HubSpotContactTasks_task_idArray: HubSpotContactTask_[]; // Link to HubSpotContactTasks
    
    @Field(() => [HubSpotCompanyTask_])
    HubSpotCompanyTasks_task_idArray: HubSpotCompanyTask_[]; // Link to HubSpotCompanyTasks
    
    @Field(() => [HubSpotTicketTask_])
    HubSpotTicketTasks_task_idArray: HubSpotTicketTask_[]; // Link to HubSpotTicketTasks
    
    @Field(() => [HubSpotDealTask_])
    HubSpotDealTasks_task_idArray: HubSpotDealTask_[]; // Link to HubSpotDealTasks
    
}

//****************************************************************************
// INPUT TYPE for Tasks
//****************************************************************************
@InputType()
export class CreateHubSpotTaskInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    hs_task_subject: string | null;

    @Field({ nullable: true })
    hs_task_body: string | null;

    @Field({ nullable: true })
    hs_task_status: string | null;

    @Field({ nullable: true })
    hs_task_priority: string | null;

    @Field({ nullable: true })
    hs_task_type: string | null;

    @Field({ nullable: true })
    hs_timestamp: Date | null;

    @Field({ nullable: true })
    hs_task_completion_date: string | null;

    @Field({ nullable: true })
    hs_queue_membership_ids: string | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Tasks
//****************************************************************************
@InputType()
export class UpdateHubSpotTaskInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    hs_task_subject?: string | null;

    @Field({ nullable: true })
    hs_task_body?: string | null;

    @Field({ nullable: true })
    hs_task_status?: string | null;

    @Field({ nullable: true })
    hs_task_priority?: string | null;

    @Field({ nullable: true })
    hs_task_type?: string | null;

    @Field({ nullable: true })
    hs_timestamp?: Date | null;

    @Field({ nullable: true })
    hs_task_completion_date?: string | null;

    @Field({ nullable: true })
    hs_queue_membership_ids?: string | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Tasks
//****************************************************************************
@ObjectType()
export class RunHubSpotTaskViewResult {
    @Field(() => [HubSpotTask_])
    Results: HubSpotTask_[];

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

@Resolver(HubSpotTask_)
export class HubSpotTaskResolver extends ResolverBase {
    @Query(() => RunHubSpotTaskViewResult)
    async RunHubSpotTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTaskViewResult)
    async RunHubSpotTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTaskViewResult)
    async RunHubSpotTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTask_, { nullable: true })
    async HubSpotTask(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTask_ | null> {
        this.CheckUserReadPermissions('Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTasks')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Tasks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotContactTask_])
    async HubSpotContactTasks_task_idArray(@Root() hubspottask_: HubSpotTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactTasks')} WHERE ${provider.QuoteIdentifier('task_id')}='${hubspottask_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotCompanyTask_])
    async HubSpotCompanyTasks_task_idArray(@Root() hubspottask_: HubSpotTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyTasks')} WHERE ${provider.QuoteIdentifier('task_id')}='${hubspottask_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketTask_])
    async HubSpotTicketTasks_task_idArray(@Root() hubspottask_: HubSpotTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketTasks')} WHERE ${provider.QuoteIdentifier('task_id')}='${hubspottask_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotDealTask_])
    async HubSpotDealTasks_task_idArray(@Root() hubspottask_: HubSpotTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwDealTasks')} WHERE ${provider.QuoteIdentifier('task_id')}='${hubspottask_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotTask_)
    async CreateHubSpotTask(
        @Arg('input', () => CreateHubSpotTaskInput) input: CreateHubSpotTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTask_)
    async UpdateHubSpotTask(
        @Arg('input', () => UpdateHubSpotTaskInput) input: UpdateHubSpotTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTask_)
    async DeleteHubSpotTask(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Tasks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Calls
//****************************************************************************
@ObjectType({ description: `Associations between tickets and logged calls` })
export class HubSpotTicketCall_ {
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({description: `HubSpot Call hs_object_id`}) 
    @MaxLength(100)
    call_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Calls
//****************************************************************************
@InputType()
export class CreateHubSpotTicketCallInput {
    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    call_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Calls
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketCallInput {
    @Field()
    ticket_id: string;

    @Field()
    call_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Calls
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketCallViewResult {
    @Field(() => [HubSpotTicketCall_])
    Results: HubSpotTicketCall_[];

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

@Resolver(HubSpotTicketCall_)
export class HubSpotTicketCallResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketCallViewResult)
    async RunHubSpotTicketCallViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketCallViewResult)
    async RunHubSpotTicketCallViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketCallViewResult)
    async RunHubSpotTicketCallDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Calls';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicketCall_, { nullable: true })
    async HubSpotTicketCall(@Arg('ticket_id', () => String) ticket_id: string, @Arg('call_id', () => String) call_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicketCall_ | null> {
        this.CheckUserReadPermissions('Ticket Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketCalls')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' AND ${provider.QuoteIdentifier('call_id')}='${call_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Calls', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotTicketCall_)
    async CreateHubSpotTicketCall(
        @Arg('input', () => CreateHubSpotTicketCallInput) input: CreateHubSpotTicketCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Calls', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicketCall_)
    async UpdateHubSpotTicketCall(
        @Arg('input', () => UpdateHubSpotTicketCallInput) input: UpdateHubSpotTicketCallInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Calls', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicketCall_)
    async DeleteHubSpotTicketCall(@Arg('ticket_id', () => String) ticket_id: string, @Arg('call_id', () => String) call_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ticket_id', Value: ticket_id}, {FieldName: 'call_id', Value: call_id}]);
        return this.DeleteRecord('Ticket Calls', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Emails
//****************************************************************************
@ObjectType({ description: `Associations between tickets and logged emails` })
export class HubSpotTicketEmail_ {
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({description: `HubSpot Email hs_object_id`}) 
    @MaxLength(100)
    email_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Emails
//****************************************************************************
@InputType()
export class CreateHubSpotTicketEmailInput {
    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    email_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Emails
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketEmailInput {
    @Field()
    ticket_id: string;

    @Field()
    email_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Emails
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketEmailViewResult {
    @Field(() => [HubSpotTicketEmail_])
    Results: HubSpotTicketEmail_[];

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

@Resolver(HubSpotTicketEmail_)
export class HubSpotTicketEmailResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketEmailViewResult)
    async RunHubSpotTicketEmailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketEmailViewResult)
    async RunHubSpotTicketEmailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketEmailViewResult)
    async RunHubSpotTicketEmailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicketEmail_, { nullable: true })
    async HubSpotTicketEmail(@Arg('ticket_id', () => String) ticket_id: string, @Arg('email_id', () => String) email_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicketEmail_ | null> {
        this.CheckUserReadPermissions('Ticket Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketEmails')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' AND ${provider.QuoteIdentifier('email_id')}='${email_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotTicketEmail_)
    async CreateHubSpotTicketEmail(
        @Arg('input', () => CreateHubSpotTicketEmailInput) input: CreateHubSpotTicketEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicketEmail_)
    async UpdateHubSpotTicketEmail(
        @Arg('input', () => UpdateHubSpotTicketEmailInput) input: UpdateHubSpotTicketEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicketEmail_)
    async DeleteHubSpotTicketEmail(@Arg('ticket_id', () => String) ticket_id: string, @Arg('email_id', () => String) email_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ticket_id', Value: ticket_id}, {FieldName: 'email_id', Value: email_id}]);
        return this.DeleteRecord('Ticket Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Feedback Submissions
//****************************************************************************
@ObjectType({ description: `Associations between tickets and feedback submissions` })
export class HubSpotTicketFeedbackSubmission_ {
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({description: `HubSpot FeedbackSubmission hs_object_id`}) 
    @MaxLength(100)
    feedback_submission_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Feedback Submissions
//****************************************************************************
@InputType()
export class CreateHubSpotTicketFeedbackSubmissionInput {
    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    feedback_submission_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Feedback Submissions
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketFeedbackSubmissionInput {
    @Field()
    ticket_id: string;

    @Field()
    feedback_submission_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Feedback Submissions
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketFeedbackSubmissionViewResult {
    @Field(() => [HubSpotTicketFeedbackSubmission_])
    Results: HubSpotTicketFeedbackSubmission_[];

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

@Resolver(HubSpotTicketFeedbackSubmission_)
export class HubSpotTicketFeedbackSubmissionResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketFeedbackSubmissionViewResult)
    async RunHubSpotTicketFeedbackSubmissionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketFeedbackSubmissionViewResult)
    async RunHubSpotTicketFeedbackSubmissionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketFeedbackSubmissionViewResult)
    async RunHubSpotTicketFeedbackSubmissionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Feedback Submissions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicketFeedbackSubmission_, { nullable: true })
    async HubSpotTicketFeedbackSubmission(@Arg('ticket_id', () => String) ticket_id: string, @Arg('feedback_submission_id', () => String) feedback_submission_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicketFeedbackSubmission_ | null> {
        this.CheckUserReadPermissions('Ticket Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' AND ${provider.QuoteIdentifier('feedback_submission_id')}='${feedback_submission_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Feedback Submissions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotTicketFeedbackSubmission_)
    async CreateHubSpotTicketFeedbackSubmission(
        @Arg('input', () => CreateHubSpotTicketFeedbackSubmissionInput) input: CreateHubSpotTicketFeedbackSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Feedback Submissions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicketFeedbackSubmission_)
    async UpdateHubSpotTicketFeedbackSubmission(
        @Arg('input', () => UpdateHubSpotTicketFeedbackSubmissionInput) input: UpdateHubSpotTicketFeedbackSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Feedback Submissions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicketFeedbackSubmission_)
    async DeleteHubSpotTicketFeedbackSubmission(@Arg('ticket_id', () => String) ticket_id: string, @Arg('feedback_submission_id', () => String) feedback_submission_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ticket_id', Value: ticket_id}, {FieldName: 'feedback_submission_id', Value: feedback_submission_id}]);
        return this.DeleteRecord('Ticket Feedback Submissions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Meetings
//****************************************************************************
@ObjectType({ description: `Associations between tickets and meetings` })
export class HubSpotTicketMeeting_ {
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({description: `HubSpot Meeting hs_object_id`}) 
    @MaxLength(100)
    meeting_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Meetings
//****************************************************************************
@InputType()
export class CreateHubSpotTicketMeetingInput {
    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    meeting_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Meetings
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketMeetingInput {
    @Field()
    ticket_id: string;

    @Field()
    meeting_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Meetings
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketMeetingViewResult {
    @Field(() => [HubSpotTicketMeeting_])
    Results: HubSpotTicketMeeting_[];

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

@Resolver(HubSpotTicketMeeting_)
export class HubSpotTicketMeetingResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketMeetingViewResult)
    async RunHubSpotTicketMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketMeetingViewResult)
    async RunHubSpotTicketMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketMeetingViewResult)
    async RunHubSpotTicketMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicketMeeting_, { nullable: true })
    async HubSpotTicketMeeting(@Arg('ticket_id', () => String) ticket_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicketMeeting_ | null> {
        this.CheckUserReadPermissions('Ticket Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketMeetings')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' AND ${provider.QuoteIdentifier('meeting_id')}='${meeting_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Meetings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotTicketMeeting_)
    async CreateHubSpotTicketMeeting(
        @Arg('input', () => CreateHubSpotTicketMeetingInput) input: CreateHubSpotTicketMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicketMeeting_)
    async UpdateHubSpotTicketMeeting(
        @Arg('input', () => UpdateHubSpotTicketMeetingInput) input: UpdateHubSpotTicketMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicketMeeting_)
    async DeleteHubSpotTicketMeeting(@Arg('ticket_id', () => String) ticket_id: string, @Arg('meeting_id', () => String) meeting_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ticket_id', Value: ticket_id}, {FieldName: 'meeting_id', Value: meeting_id}]);
        return this.DeleteRecord('Ticket Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Notes
//****************************************************************************
@ObjectType({ description: `Associations between tickets and notes` })
export class HubSpotTicketNote_ {
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({description: `HubSpot Note hs_object_id`}) 
    @MaxLength(100)
    note_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Notes
//****************************************************************************
@InputType()
export class CreateHubSpotTicketNoteInput {
    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    note_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Notes
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketNoteInput {
    @Field()
    ticket_id: string;

    @Field()
    note_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Notes
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketNoteViewResult {
    @Field(() => [HubSpotTicketNote_])
    Results: HubSpotTicketNote_[];

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

@Resolver(HubSpotTicketNote_)
export class HubSpotTicketNoteResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketNoteViewResult)
    async RunHubSpotTicketNoteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketNoteViewResult)
    async RunHubSpotTicketNoteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketNoteViewResult)
    async RunHubSpotTicketNoteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Notes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicketNote_, { nullable: true })
    async HubSpotTicketNote(@Arg('ticket_id', () => String) ticket_id: string, @Arg('note_id', () => String) note_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicketNote_ | null> {
        this.CheckUserReadPermissions('Ticket Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketNotes')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' AND ${provider.QuoteIdentifier('note_id')}='${note_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Notes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotTicketNote_)
    async CreateHubSpotTicketNote(
        @Arg('input', () => CreateHubSpotTicketNoteInput) input: CreateHubSpotTicketNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Notes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicketNote_)
    async UpdateHubSpotTicketNote(
        @Arg('input', () => UpdateHubSpotTicketNoteInput) input: UpdateHubSpotTicketNoteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Notes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicketNote_)
    async DeleteHubSpotTicketNote(@Arg('ticket_id', () => String) ticket_id: string, @Arg('note_id', () => String) note_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ticket_id', Value: ticket_id}, {FieldName: 'note_id', Value: note_id}]);
        return this.DeleteRecord('Ticket Notes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Tasks
//****************************************************************************
@ObjectType({ description: `Associations between tickets and tasks` })
export class HubSpotTicketTask_ {
    @Field({description: `HubSpot Ticket hs_object_id`}) 
    @MaxLength(100)
    ticket_id: string;
        
    @Field({description: `HubSpot Task hs_object_id`}) 
    @MaxLength(100)
    task_id: string;
        
    @Field({nullable: true, description: `HubSpot association label (e.g., Primary, Unlabeled)`}) 
    @MaxLength(100)
    association_type?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Tasks
//****************************************************************************
@InputType()
export class CreateHubSpotTicketTaskInput {
    @Field({ nullable: true })
    ticket_id?: string;

    @Field({ nullable: true })
    task_id?: string;

    @Field({ nullable: true })
    association_type: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Tasks
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketTaskInput {
    @Field()
    ticket_id: string;

    @Field()
    task_id: string;

    @Field({ nullable: true })
    association_type?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Tasks
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketTaskViewResult {
    @Field(() => [HubSpotTicketTask_])
    Results: HubSpotTicketTask_[];

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

@Resolver(HubSpotTicketTask_)
export class HubSpotTicketTaskResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketTaskViewResult)
    async RunHubSpotTicketTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketTaskViewResult)
    async RunHubSpotTicketTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketTaskViewResult)
    async RunHubSpotTicketTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicketTask_, { nullable: true })
    async HubSpotTicketTask(@Arg('ticket_id', () => String) ticket_id: string, @Arg('task_id', () => String) task_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicketTask_ | null> {
        this.CheckUserReadPermissions('Ticket Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketTasks')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${ticket_id}' AND ${provider.QuoteIdentifier('task_id')}='${task_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Tasks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => HubSpotTicketTask_)
    async CreateHubSpotTicketTask(
        @Arg('input', () => CreateHubSpotTicketTaskInput) input: CreateHubSpotTicketTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicketTask_)
    async UpdateHubSpotTicketTask(
        @Arg('input', () => UpdateHubSpotTicketTaskInput) input: UpdateHubSpotTicketTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicketTask_)
    async DeleteHubSpotTicketTask(@Arg('ticket_id', () => String) ticket_id: string, @Arg('task_id', () => String) task_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ticket_id', Value: ticket_id}, {FieldName: 'task_id', Value: task_id}]);
        return this.DeleteRecord('Ticket Tasks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Tickets
//****************************************************************************
@ObjectType({ description: `Support tickets with pipeline, priority, and category tracking` })
export class HubSpotTicket_ {
    @Field() 
    @MaxLength(100)
    hs_object_id: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    subject?: string;
        
    @Field({nullable: true}) 
    content?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_pipeline?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_pipeline_stage?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_ticket_priority?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    hs_ticket_category?: string;
        
    @Field({nullable: true}) 
    createdate?: Date;
        
    @Field({nullable: true}) 
    hs_lastmodifieddate?: Date;
        
    @Field({nullable: true}) 
    closed_date?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    source_type?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    hubspot_owner_id?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [HubSpotCompanyTicket_])
    HubSpotCompanyTickets_ticket_idArray: HubSpotCompanyTicket_[]; // Link to HubSpotCompanyTickets
    
    @Field(() => [HubSpotTicketCall_])
    HubSpotTicketCalls_ticket_idArray: HubSpotTicketCall_[]; // Link to HubSpotTicketCalls
    
    @Field(() => [HubSpotTicketTask_])
    HubSpotTicketTasks_ticket_idArray: HubSpotTicketTask_[]; // Link to HubSpotTicketTasks
    
    @Field(() => [HubSpotTicketFeedbackSubmission_])
    HubSpotTicketFeedbackSubmissions_ticket_idArray: HubSpotTicketFeedbackSubmission_[]; // Link to HubSpotTicketFeedbackSubmissions
    
    @Field(() => [HubSpotTicketMeeting_])
    HubSpotTicketMeetings_ticket_idArray: HubSpotTicketMeeting_[]; // Link to HubSpotTicketMeetings
    
    @Field(() => [HubSpotContactTicket_])
    HubSpotContactTickets_ticket_idArray: HubSpotContactTicket_[]; // Link to HubSpotContactTickets
    
    @Field(() => [HubSpotTicketEmail_])
    HubSpotTicketEmails_ticket_idArray: HubSpotTicketEmail_[]; // Link to HubSpotTicketEmails
    
    @Field(() => [HubSpotTicketNote_])
    HubSpotTicketNotes_ticket_idArray: HubSpotTicketNote_[]; // Link to HubSpotTicketNotes
    
}

//****************************************************************************
// INPUT TYPE for Tickets
//****************************************************************************
@InputType()
export class CreateHubSpotTicketInput {
    @Field({ nullable: true })
    hs_object_id?: string;

    @Field({ nullable: true })
    subject: string | null;

    @Field({ nullable: true })
    content: string | null;

    @Field({ nullable: true })
    hs_pipeline: string | null;

    @Field({ nullable: true })
    hs_pipeline_stage: string | null;

    @Field({ nullable: true })
    hs_ticket_priority: string | null;

    @Field({ nullable: true })
    hs_ticket_category: string | null;

    @Field({ nullable: true })
    createdate: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate: Date | null;

    @Field({ nullable: true })
    closed_date: Date | null;

    @Field({ nullable: true })
    source_type: string | null;

    @Field({ nullable: true })
    hubspot_owner_id: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Tickets
//****************************************************************************
@InputType()
export class UpdateHubSpotTicketInput {
    @Field()
    hs_object_id: string;

    @Field({ nullable: true })
    subject?: string | null;

    @Field({ nullable: true })
    content?: string | null;

    @Field({ nullable: true })
    hs_pipeline?: string | null;

    @Field({ nullable: true })
    hs_pipeline_stage?: string | null;

    @Field({ nullable: true })
    hs_ticket_priority?: string | null;

    @Field({ nullable: true })
    hs_ticket_category?: string | null;

    @Field({ nullable: true })
    createdate?: Date | null;

    @Field({ nullable: true })
    hs_lastmodifieddate?: Date | null;

    @Field({ nullable: true })
    closed_date?: Date | null;

    @Field({ nullable: true })
    source_type?: string | null;

    @Field({ nullable: true })
    hubspot_owner_id?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Tickets
//****************************************************************************
@ObjectType()
export class RunHubSpotTicketViewResult {
    @Field(() => [HubSpotTicket_])
    Results: HubSpotTicket_[];

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

@Resolver(HubSpotTicket_)
export class HubSpotTicketResolver extends ResolverBase {
    @Query(() => RunHubSpotTicketViewResult)
    async RunHubSpotTicketViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketViewResult)
    async RunHubSpotTicketViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunHubSpotTicketViewResult)
    async RunHubSpotTicketDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Tickets';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => HubSpotTicket_, { nullable: true })
    async HubSpotTicket(@Arg('hs_object_id', () => String) hs_object_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<HubSpotTicket_ | null> {
        this.CheckUserReadPermissions('Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTickets')} WHERE ${provider.QuoteIdentifier('hs_object_id')}='${hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Tickets', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [HubSpotCompanyTicket_])
    async HubSpotCompanyTickets_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwCompanyTickets')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketCall_])
    async HubSpotTicketCalls_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Calls', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketCalls')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Calls', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Calls', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketTask_])
    async HubSpotTicketTasks_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketTasks')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketFeedbackSubmission_])
    async HubSpotTicketFeedbackSubmissions_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Feedback Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketFeedbackSubmissions')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Feedback Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Feedback Submissions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketMeeting_])
    async HubSpotTicketMeetings_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketMeetings')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotContactTicket_])
    async HubSpotContactTickets_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwContactTickets')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketEmail_])
    async HubSpotTicketEmails_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketEmails')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Emails', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [HubSpotTicketNote_])
    async HubSpotTicketNotes_ticket_idArray(@Root() hubspotticket_: HubSpotTicket_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Notes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('HubSpot', 'vwTicketNotes')} WHERE ${provider.QuoteIdentifier('ticket_id')}='${hubspotticket_.hs_object_id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Notes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Notes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => HubSpotTicket_)
    async CreateHubSpotTicket(
        @Arg('input', () => CreateHubSpotTicketInput) input: CreateHubSpotTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Tickets', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => HubSpotTicket_)
    async UpdateHubSpotTicket(
        @Arg('input', () => UpdateHubSpotTicketInput) input: UpdateHubSpotTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Tickets', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => HubSpotTicket_)
    async DeleteHubSpotTicket(@Arg('hs_object_id', () => String) hs_object_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hs_object_id', Value: hs_object_id}]);
        return this.DeleteRecord('Tickets', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Time Zones
//****************************************************************************
@ObjectType({ description: `Time zone reference data with GMT offsets and display names` })
export class YourMembershipTimeZone_ {
    @Field() 
    @MaxLength(200)
    fullName: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    gmtOffset?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Time Zones
//****************************************************************************
@InputType()
export class CreateYourMembershipTimeZoneInput {
    @Field({ nullable: true })
    fullName?: string;

    @Field({ nullable: true })
    gmtOffset: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Time Zones
//****************************************************************************
@InputType()
export class UpdateYourMembershipTimeZoneInput {
    @Field()
    fullName: string;

    @Field({ nullable: true })
    gmtOffset?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Time Zones
//****************************************************************************
@ObjectType()
export class RunYourMembershipTimeZoneViewResult {
    @Field(() => [YourMembershipTimeZone_])
    Results: YourMembershipTimeZone_[];

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

@Resolver(YourMembershipTimeZone_)
export class YourMembershipTimeZoneResolver extends ResolverBase {
    @Query(() => RunYourMembershipTimeZoneViewResult)
    async RunYourMembershipTimeZoneViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipTimeZoneViewResult)
    async RunYourMembershipTimeZoneViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunYourMembershipTimeZoneViewResult)
    async RunYourMembershipTimeZoneDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Time Zones';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => YourMembershipTimeZone_, { nullable: true })
    async YourMembershipTimeZone(@Arg('fullName', () => String) fullName: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<YourMembershipTimeZone_ | null> {
        this.CheckUserReadPermissions('Time Zones', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('YourMembership', 'vwTimeZones')} WHERE ${provider.QuoteIdentifier('fullName')}='${fullName}' ` + this.getRowLevelSecurityWhereClause(provider, 'Time Zones', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Time Zones', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => YourMembershipTimeZone_)
    async CreateYourMembershipTimeZone(
        @Arg('input', () => CreateYourMembershipTimeZoneInput) input: CreateYourMembershipTimeZoneInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Time Zones', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => YourMembershipTimeZone_)
    async UpdateYourMembershipTimeZone(
        @Arg('input', () => UpdateYourMembershipTimeZoneInput) input: UpdateYourMembershipTimeZoneInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Time Zones', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => YourMembershipTimeZone_)
    async DeleteYourMembershipTimeZone(@Arg('fullName', () => String) fullName: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'fullName', Value: fullName}]);
        return this.DeleteRecord('Time Zones', key, options, provider, userPayload, pubSub);
    }
    
}