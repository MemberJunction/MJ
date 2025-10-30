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


import { SubmissionReviewEntity, AccountStatusEntity, IndustryEntity, ContactEntity, EventReviewTaskEntity, DealProductEntity, SubmissionSpeakerEntity, PaymentEntity, AccountInsightEntity, InvoiceEntity, SpeakerEntity, EventEntity, ActivityTypeEntity, AccountEntity, ContactRelationshipEntity, ActivityEntity, DealEntity, RelationshipTypeEntity, SubmissionNotificationEntity, SubmissionEntity, InvoiceLineItemEntity, AccountTypeEntity, ProductEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Submission Reviews
//****************************************************************************
@ObjectType({ description: `Human reviews and scoring of submissions by review committee members` })
export class EventsSubmissionReview_ {
    @Field({description: `Unique identifier for the review`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Submission being reviewed`}) 
    @MaxLength(16)
    SubmissionID: string;
        
    @Field(() => Int, {description: `CRM Contact ID of the reviewer`}) 
    ReviewerContactID: number;
        
    @Field({description: `Timestamp when review was submitted`}) 
    @MaxLength(8)
    ReviewedAt: Date;
        
    @Field(() => Float, {nullable: true, description: `Overall score from 0-10`}) 
    OverallScore?: number;
        
    @Field(() => Float, {nullable: true, description: `Relevance to conference theme score (0-10)`}) 
    RelevanceScore?: number;
        
    @Field(() => Float, {nullable: true, description: `Quality of abstract and proposed content score (0-10)`}) 
    QualityScore?: number;
        
    @Field(() => Float, {nullable: true, description: `Speaker experience and credibility score (0-10)`}) 
    SpeakerExperienceScore?: number;
        
    @Field({nullable: true, description: `Reviewer comments and feedback`}) 
    Comments?: string;
        
    @Field({nullable: true, description: `Reviewer recommendation (Accept, Reject, Waitlist, Needs Discussion)`}) 
    @MaxLength(100)
    Recommendation?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Submission Reviews
//****************************************************************************
@InputType()
export class CreateEventsSubmissionReviewInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field(() => Int, { nullable: true })
    ReviewerContactID?: number;

    @Field({ nullable: true })
    ReviewedAt?: Date;

    @Field(() => Float, { nullable: true })
    OverallScore: number | null;

    @Field(() => Float, { nullable: true })
    RelevanceScore: number | null;

    @Field(() => Float, { nullable: true })
    QualityScore: number | null;

    @Field(() => Float, { nullable: true })
    SpeakerExperienceScore: number | null;

    @Field({ nullable: true })
    Comments: string | null;

    @Field({ nullable: true })
    Recommendation: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Submission Reviews
//****************************************************************************
@InputType()
export class UpdateEventsSubmissionReviewInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field(() => Int, { nullable: true })
    ReviewerContactID?: number;

    @Field({ nullable: true })
    ReviewedAt?: Date;

    @Field(() => Float, { nullable: true })
    OverallScore?: number | null;

    @Field(() => Float, { nullable: true })
    RelevanceScore?: number | null;

    @Field(() => Float, { nullable: true })
    QualityScore?: number | null;

    @Field(() => Float, { nullable: true })
    SpeakerExperienceScore?: number | null;

    @Field({ nullable: true })
    Comments?: string | null;

    @Field({ nullable: true })
    Recommendation?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Submission Reviews
//****************************************************************************
@ObjectType()
export class RunEventsSubmissionReviewViewResult {
    @Field(() => [EventsSubmissionReview_])
    Results: EventsSubmissionReview_[];

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

@Resolver(EventsSubmissionReview_)
export class EventsSubmissionReviewResolver extends ResolverBase {
    @Query(() => RunEventsSubmissionReviewViewResult)
    async RunEventsSubmissionReviewViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionReviewViewResult)
    async RunEventsSubmissionReviewViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionReviewViewResult)
    async RunEventsSubmissionReviewDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Submission Reviews';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsSubmissionReview_, { nullable: true })
    async EventsSubmissionReview(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsSubmissionReview_ | null> {
        this.CheckUserReadPermissions('Submission Reviews', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionReviews] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Reviews', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Submission Reviews', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => EventsSubmissionReview_)
    async CreateEventsSubmissionReview(
        @Arg('input', () => CreateEventsSubmissionReviewInput) input: CreateEventsSubmissionReviewInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Submission Reviews', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsSubmissionReview_)
    async UpdateEventsSubmissionReview(
        @Arg('input', () => UpdateEventsSubmissionReviewInput) input: UpdateEventsSubmissionReviewInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Submission Reviews', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsSubmissionReview_)
    async DeleteEventsSubmissionReview(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Submission Reviews', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Status
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing account status values` })
export class CRMAccountStatus_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the account status`}) 
    @MaxLength(40)
    Name: string;
        
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
export class CreateCRMAccountStatusInput {
    @Field({ nullable: true })
    Name?: string;
}
    

//****************************************************************************
// INPUT TYPE for Account Status
//****************************************************************************
@InputType()
export class UpdateCRMAccountStatusInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Account Status
//****************************************************************************
@ObjectType()
export class RunCRMAccountStatusViewResult {
    @Field(() => [CRMAccountStatus_])
    Results: CRMAccountStatus_[];

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

@Resolver(CRMAccountStatus_)
export class CRMAccountStatusResolver extends ResolverBase {
    @Query(() => RunCRMAccountStatusViewResult)
    async RunCRMAccountStatusViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountStatusViewResult)
    async RunCRMAccountStatusViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountStatusViewResult)
    async RunCRMAccountStatusDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Status';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMAccountStatus_, { nullable: true })
    async CRMAccountStatus(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMAccountStatus_ | null> {
        this.CheckUserReadPermissions('Account Status', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountStatus] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Status', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Account Status', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMAccountStatus_)
    async CreateCRMAccountStatus(
        @Arg('input', () => CreateCRMAccountStatusInput) input: CreateCRMAccountStatusInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Status', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMAccountStatus_)
    async UpdateCRMAccountStatus(
        @Arg('input', () => UpdateCRMAccountStatusInput) input: UpdateCRMAccountStatusInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Status', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMAccountStatus_)
    async DeleteCRMAccountStatus(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Status', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Industries
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing industry values` })
export class CRMIndustry_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the industry`}) 
    @MaxLength(100)
    Name: string;
        
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
export class CreateCRMIndustryInput {
    @Field({ nullable: true })
    Name?: string;
}
    

//****************************************************************************
// INPUT TYPE for Industries
//****************************************************************************
@InputType()
export class UpdateCRMIndustryInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Industries
//****************************************************************************
@ObjectType()
export class RunCRMIndustryViewResult {
    @Field(() => [CRMIndustry_])
    Results: CRMIndustry_[];

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

@Resolver(CRMIndustry_)
export class CRMIndustryResolver extends ResolverBase {
    @Query(() => RunCRMIndustryViewResult)
    async RunCRMIndustryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMIndustryViewResult)
    async RunCRMIndustryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMIndustryViewResult)
    async RunCRMIndustryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Industries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMIndustry_, { nullable: true })
    async CRMIndustry(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMIndustry_ | null> {
        this.CheckUserReadPermissions('Industries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwIndustries] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Industries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Industries', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMIndustry_)
    async CreateCRMIndustry(
        @Arg('input', () => CreateCRMIndustryInput) input: CreateCRMIndustryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Industries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMIndustry_)
    async UpdateCRMIndustry(
        @Arg('input', () => UpdateCRMIndustryInput) input: UpdateCRMIndustryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Industries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMIndustry_)
    async DeleteCRMIndustry(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Industries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `Stores information about individual people associated with accounts` })
export class CRMContact_ {
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
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Account?: string;
        
    @Field(() => Int, {nullable: true}) 
    RootReportsToID?: number;
        
    @Field(() => [CRMContactRelationship_])
    ContactRelationships_RelatedContactIDArray: CRMContactRelationship_[]; // Link to ContactRelationships
    
    @Field(() => [CRMActivity_])
    Activities_ContactIDArray: CRMActivity_[]; // Link to Activities
    
    @Field(() => [EventsSpeaker_])
    Speakers_ContactIDArray: EventsSpeaker_[]; // Link to Speakers
    
    @Field(() => [CRMAccountInsight_])
    AccountInsights_CreatedByContactIDArray: CRMAccountInsight_[]; // Link to AccountInsights
    
    @Field(() => [EventsEventReviewTask_])
    EventReviewTasks_AssignedToContactIDArray: EventsEventReviewTask_[]; // Link to EventReviewTasks
    
    @Field(() => [CRMDeal_])
    Deals_OwnerIDArray: CRMDeal_[]; // Link to Deals
    
    @Field(() => [CRMContact_])
    Contacts_ReportsToIDArray: CRMContact_[]; // Link to Contacts
    
    @Field(() => [EventsSubmissionReview_])
    SubmissionReviews_ReviewerContactIDArray: EventsSubmissionReview_[]; // Link to SubmissionReviews
    
    @Field(() => [CRMContactRelationship_])
    ContactRelationships_PrimaryContactIDArray: CRMContactRelationship_[]; // Link to ContactRelationships
    
    @Field(() => [CRMDeal_])
    Deals_ContactIDArray: CRMDeal_[]; // Link to Deals
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateCRMContactInput {
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
export class UpdateCRMContactInput {
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
export class RunCRMContactViewResult {
    @Field(() => [CRMContact_])
    Results: CRMContact_[];

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

@Resolver(CRMContact_)
export class CRMContactResolver extends ResolverBase {
    @Query(() => RunCRMContactViewResult)
    async RunCRMContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMContactViewResult)
    async RunCRMContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMContactViewResult)
    async RunCRMContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMContact_, { nullable: true })
    async CRMContact(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMContact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [CRMContactRelationship_])
    async ContactRelationships_RelatedContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [RelatedContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contact Relationships', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMActivity_])
    async Activities_ContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivities] WHERE [ContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsSpeaker_])
    async Speakers_ContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Speakers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSpeakers] WHERE [ContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Speakers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Speakers', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMAccountInsight_])
    async AccountInsights_CreatedByContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Account Insights', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountInsights] WHERE [CreatedByContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Insights', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Account Insights', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsEventReviewTask_])
    async EventReviewTasks_AssignedToContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Review Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEventReviewTasks] WHERE [AssignedToContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Event Review Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Event Review Tasks', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMDeal_])
    async Deals_OwnerIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDeals] WHERE [OwnerID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMContact_])
    async Contacts_ReportsToIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts] WHERE [ReportsToID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsSubmissionReview_])
    async SubmissionReviews_ReviewerContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submission Reviews', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionReviews] WHERE [ReviewerContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Reviews', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submission Reviews', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMContactRelationship_])
    async ContactRelationships_PrimaryContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [PrimaryContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contact Relationships', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMDeal_])
    async Deals_ContactIDArray(@Root() crmcontact_: CRMContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDeals] WHERE [ContactID]=${crmcontact_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', rows);
        return result;
    }
        
    @Mutation(() => CRMContact_)
    async CreateCRMContact(
        @Arg('input', () => CreateCRMContactInput) input: CreateCRMContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMContact_)
    async UpdateCRMContact(
        @Arg('input', () => UpdateCRMContactInput) input: UpdateCRMContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMContact_)
    async DeleteCRMContact(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Review Tasks
//****************************************************************************
@ObjectType({ description: `Work queue for review committee members with task tracking` })
export class EventsEventReviewTask_ {
    @Field({description: `Unique identifier for the review task`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Event this review task is for`}) 
    @MaxLength(16)
    EventID: string;
        
    @Field({description: `Submission to be reviewed`}) 
    @MaxLength(16)
    SubmissionID: string;
        
    @Field(() => Int, {nullable: true, description: `CRM Contact ID of assigned reviewer (NULL if unassigned)`}) 
    AssignedToContactID?: number;
        
    @Field({description: `Current status of the review task (Pending, In Progress, Completed, Canceled)`}) 
    @MaxLength(100)
    Status: string;
        
    @Field({nullable: true, description: `Priority level (High, Normal, Low)`}) 
    @MaxLength(40)
    Priority?: string;
        
    @Field({nullable: true, description: `Due date for completing the review`}) 
    @MaxLength(8)
    DueDate?: Date;
        
    @Field({nullable: true, description: `Timestamp when task was completed`}) 
    @MaxLength(8)
    CompletedAt?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Event: string;
        
}

//****************************************************************************
// INPUT TYPE for Event Review Tasks
//****************************************************************************
@InputType()
export class CreateEventsEventReviewTaskInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field(() => Int, { nullable: true })
    AssignedToContactID: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Priority?: string | null;

    @Field({ nullable: true })
    DueDate: Date | null;

    @Field({ nullable: true })
    CompletedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Review Tasks
//****************************************************************************
@InputType()
export class UpdateEventsEventReviewTaskInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field(() => Int, { nullable: true })
    AssignedToContactID?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Priority?: string | null;

    @Field({ nullable: true })
    DueDate?: Date | null;

    @Field({ nullable: true })
    CompletedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Review Tasks
//****************************************************************************
@ObjectType()
export class RunEventsEventReviewTaskViewResult {
    @Field(() => [EventsEventReviewTask_])
    Results: EventsEventReviewTask_[];

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

@Resolver(EventsEventReviewTask_)
export class EventsEventReviewTaskResolver extends ResolverBase {
    @Query(() => RunEventsEventReviewTaskViewResult)
    async RunEventsEventReviewTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsEventReviewTaskViewResult)
    async RunEventsEventReviewTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsEventReviewTaskViewResult)
    async RunEventsEventReviewTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Review Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsEventReviewTask_, { nullable: true })
    async EventsEventReviewTask(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsEventReviewTask_ | null> {
        this.CheckUserReadPermissions('Event Review Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEventReviewTasks] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Review Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Event Review Tasks', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => EventsEventReviewTask_)
    async CreateEventsEventReviewTask(
        @Arg('input', () => CreateEventsEventReviewTaskInput) input: CreateEventsEventReviewTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Review Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsEventReviewTask_)
    async UpdateEventsEventReviewTask(
        @Arg('input', () => UpdateEventsEventReviewTaskInput) input: UpdateEventsEventReviewTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Review Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsEventReviewTask_)
    async DeleteEventsEventReviewTask(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Event Review Tasks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Products
//****************************************************************************
@ObjectType({ description: `Line items representing products and services included in a deal` })
export class CRMDealProduct_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    DealID: number;
        
    @Field(() => Int) 
    ProductID: number;
        
    @Field(() => Float, {description: `Number of units of the product included in the deal`}) 
    Quantity: number;
        
    @Field(() => Float, {description: `Negotiated price per unit for this deal (may differ from standard price)`}) 
    UnitPrice: number;
        
    @Field(() => Float, {nullable: true, description: `Discount percentage applied to this line item (0-100)`}) 
    Discount?: number;
        
    @Field(() => Float, {nullable: true, description: `Calculated field: Quantity × UnitPrice × (1 - Discount percentage)`}) 
    TotalPrice?: number;
        
    @Field({nullable: true, description: `Additional notes or specifications for this line item`}) 
    @MaxLength(1000)
    Notes?: string;
        
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
export class CreateCRMDealProductInput {
    @Field(() => Int, { nullable: true })
    DealID?: number;

    @Field(() => Int, { nullable: true })
    ProductID?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Discount?: number | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Deal Products
//****************************************************************************
@InputType()
export class UpdateCRMDealProductInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    DealID?: number;

    @Field(() => Int, { nullable: true })
    ProductID?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Discount?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Products
//****************************************************************************
@ObjectType()
export class RunCRMDealProductViewResult {
    @Field(() => [CRMDealProduct_])
    Results: CRMDealProduct_[];

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

@Resolver(CRMDealProduct_)
export class CRMDealProductResolver extends ResolverBase {
    @Query(() => RunCRMDealProductViewResult)
    async RunCRMDealProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMDealProductViewResult)
    async RunCRMDealProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMDealProductViewResult)
    async RunCRMDealProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMDealProduct_, { nullable: true })
    async CRMDealProduct(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMDealProduct_ | null> {
        this.CheckUserReadPermissions('Deal Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDealProducts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Deal Products', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMDealProduct_)
    async CreateCRMDealProduct(
        @Arg('input', () => CreateCRMDealProductInput) input: CreateCRMDealProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMDealProduct_)
    async UpdateCRMDealProduct(
        @Arg('input', () => UpdateCRMDealProductInput) input: UpdateCRMDealProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMDealProduct_)
    async DeleteCRMDealProduct(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Deal Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Submission Speakers
//****************************************************************************
@ObjectType({ description: `Junction table linking submissions to speakers (many-to-many relationship)` })
export class EventsSubmissionSpeaker_ {
    @Field({description: `Unique identifier for the relationship`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the submission`}) 
    @MaxLength(16)
    SubmissionID: string;
        
    @Field({description: `Reference to the speaker`}) 
    @MaxLength(16)
    SpeakerID: string;
        
    @Field(() => Boolean, {nullable: true, description: `Whether this speaker is the primary contact for the submission`}) 
    IsPrimaryContact?: boolean;
        
    @Field({nullable: true, description: `Role of speaker in this submission (Presenter, Co-Presenter, Moderator, Panelist)`}) 
    @MaxLength(100)
    Role?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Submission Speakers
//****************************************************************************
@InputType()
export class CreateEventsSubmissionSpeakerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field({ nullable: true })
    SpeakerID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimaryContact?: boolean | null;

    @Field({ nullable: true })
    Role: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Submission Speakers
//****************************************************************************
@InputType()
export class UpdateEventsSubmissionSpeakerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field({ nullable: true })
    SpeakerID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimaryContact?: boolean | null;

    @Field({ nullable: true })
    Role?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Submission Speakers
//****************************************************************************
@ObjectType()
export class RunEventsSubmissionSpeakerViewResult {
    @Field(() => [EventsSubmissionSpeaker_])
    Results: EventsSubmissionSpeaker_[];

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

@Resolver(EventsSubmissionSpeaker_)
export class EventsSubmissionSpeakerResolver extends ResolverBase {
    @Query(() => RunEventsSubmissionSpeakerViewResult)
    async RunEventsSubmissionSpeakerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionSpeakerViewResult)
    async RunEventsSubmissionSpeakerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionSpeakerViewResult)
    async RunEventsSubmissionSpeakerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Submission Speakers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsSubmissionSpeaker_, { nullable: true })
    async EventsSubmissionSpeaker(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsSubmissionSpeaker_ | null> {
        this.CheckUserReadPermissions('Submission Speakers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionSpeakers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Speakers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Submission Speakers', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => EventsSubmissionSpeaker_)
    async CreateEventsSubmissionSpeaker(
        @Arg('input', () => CreateEventsSubmissionSpeakerInput) input: CreateEventsSubmissionSpeakerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Submission Speakers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsSubmissionSpeaker_)
    async UpdateEventsSubmissionSpeaker(
        @Arg('input', () => UpdateEventsSubmissionSpeakerInput) input: UpdateEventsSubmissionSpeakerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Submission Speakers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsSubmissionSpeaker_)
    async DeleteEventsSubmissionSpeaker(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Submission Speakers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payments
//****************************************************************************
@ObjectType({ description: `Payment transactions recorded against invoices` })
export class CRMPayment_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    InvoiceID: number;
        
    @Field({description: `Date the payment was received`}) 
    @MaxLength(3)
    PaymentDate: Date;
        
    @Field(() => Float, {description: `Amount of the payment in local currency`}) 
    Amount: number;
        
    @Field({nullable: true, description: `Method of payment (Check, Credit Card, Wire Transfer, ACH, Cash, Other)`}) 
    @MaxLength(100)
    PaymentMethod?: string;
        
    @Field({nullable: true, description: `Check number, transaction ID, or other payment reference`}) 
    @MaxLength(200)
    ReferenceNumber?: string;
        
    @Field({nullable: true, description: `Additional notes about the payment`}) 
    @MaxLength(1000)
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Payments
//****************************************************************************
@InputType()
export class CreateCRMPaymentInput {
    @Field(() => Int, { nullable: true })
    InvoiceID?: number;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentMethod: string | null;

    @Field({ nullable: true })
    ReferenceNumber: string | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Payments
//****************************************************************************
@InputType()
export class UpdateCRMPaymentInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    InvoiceID?: number;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentMethod?: string | null;

    @Field({ nullable: true })
    ReferenceNumber?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payments
//****************************************************************************
@ObjectType()
export class RunCRMPaymentViewResult {
    @Field(() => [CRMPayment_])
    Results: CRMPayment_[];

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

@Resolver(CRMPayment_)
export class CRMPaymentResolver extends ResolverBase {
    @Query(() => RunCRMPaymentViewResult)
    async RunCRMPaymentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMPaymentViewResult)
    async RunCRMPaymentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMPaymentViewResult)
    async RunCRMPaymentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMPayment_, { nullable: true })
    async CRMPayment(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMPayment_ | null> {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwPayments] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Payments', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMPayment_)
    async CreateCRMPayment(
        @Arg('input', () => CreateCRMPaymentInput) input: CreateCRMPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMPayment_)
    async UpdateCRMPayment(
        @Arg('input', () => UpdateCRMPaymentInput) input: UpdateCRMPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMPayment_)
    async DeleteCRMPayment(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Payments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Insights
//****************************************************************************
@ObjectType({ description: `Stores research, news, and intelligence gathered about accounts from various sources` })
export class CRMAccountInsight_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    AccountID: number;
        
    @Field({description: `Type of insight (Manual, News Article, SEC Filing, Press Release, Social Media, Financial Report, Market Analysis, Earnings Call, Patent Filing, Leadership Change)`}) 
    @MaxLength(100)
    InsightType: string;
        
    @Field({nullable: true, description: `Title or headline of the insight`}) 
    @MaxLength(1000)
    Title?: string;
        
    @Field({nullable: true, description: `Full content or detailed notes about the insight`}) 
    Content?: string;
        
    @Field({nullable: true, description: `URL to the source article, filing, or document`}) 
    @MaxLength(1000)
    SourceURL?: string;
        
    @Field({nullable: true, description: `Date the original content was published (not when it was added to CRM)`}) 
    @MaxLength(8)
    PublishedDate?: Date;
        
    @Field({description: `Timestamp when this insight was added to the system`}) 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field(() => Int, {nullable: true, description: `Contact who manually created this insight (NULL for AI-generated insights)`}) 
    CreatedByContactID?: number;
        
    @Field({nullable: true, description: `AI-analyzed sentiment of the insight (Positive, Negative, Neutral, Mixed)`}) 
    @MaxLength(40)
    Sentiment?: string;
        
    @Field({nullable: true, description: `Priority level for follow-up or attention (High, Medium, Low)`}) 
    @MaxLength(40)
    Priority?: string;
        
    @Field({nullable: true, description: `JSON array of tags for categorization and filtering`}) 
    Tags?: string;
        
    @Field({nullable: true, description: `AI-generated concise summary of the content for quick reading`}) 
    @MaxLength(4000)
    Summary?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Whether this insight has been archived (hidden from default views)`}) 
    IsArchived?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Account: string;
        
}

//****************************************************************************
// INPUT TYPE for Account Insights
//****************************************************************************
@InputType()
export class CreateCRMAccountInsightInput {
    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field({ nullable: true })
    InsightType?: string;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Content: string | null;

    @Field({ nullable: true })
    SourceURL: string | null;

    @Field({ nullable: true })
    PublishedDate: Date | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => Int, { nullable: true })
    CreatedByContactID: number | null;

    @Field({ nullable: true })
    Sentiment: string | null;

    @Field({ nullable: true })
    Priority: string | null;

    @Field({ nullable: true })
    Tags: string | null;

    @Field({ nullable: true })
    Summary: string | null;

    @Field(() => Boolean, { nullable: true })
    IsArchived?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Account Insights
//****************************************************************************
@InputType()
export class UpdateCRMAccountInsightInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field({ nullable: true })
    InsightType?: string;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Content?: string | null;

    @Field({ nullable: true })
    SourceURL?: string | null;

    @Field({ nullable: true })
    PublishedDate?: Date | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => Int, { nullable: true })
    CreatedByContactID?: number | null;

    @Field({ nullable: true })
    Sentiment?: string | null;

    @Field({ nullable: true })
    Priority?: string | null;

    @Field({ nullable: true })
    Tags?: string | null;

    @Field({ nullable: true })
    Summary?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsArchived?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Account Insights
//****************************************************************************
@ObjectType()
export class RunCRMAccountInsightViewResult {
    @Field(() => [CRMAccountInsight_])
    Results: CRMAccountInsight_[];

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

@Resolver(CRMAccountInsight_)
export class CRMAccountInsightResolver extends ResolverBase {
    @Query(() => RunCRMAccountInsightViewResult)
    async RunCRMAccountInsightViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountInsightViewResult)
    async RunCRMAccountInsightViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountInsightViewResult)
    async RunCRMAccountInsightDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Insights';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMAccountInsight_, { nullable: true })
    async CRMAccountInsight(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMAccountInsight_ | null> {
        this.CheckUserReadPermissions('Account Insights', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountInsights] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Insights', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Account Insights', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMAccountInsight_)
    async CreateCRMAccountInsight(
        @Arg('input', () => CreateCRMAccountInsightInput) input: CreateCRMAccountInsightInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Insights', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMAccountInsight_)
    async UpdateCRMAccountInsight(
        @Arg('input', () => UpdateCRMAccountInsightInput) input: UpdateCRMAccountInsightInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Insights', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMAccountInsight_)
    async DeleteCRMAccountInsight(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Insights', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Invoices
//****************************************************************************
@ObjectType({ description: `Customer invoices for products and services rendered` })
export class CRMInvoice_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Unique invoice identifier for external reference`}) 
    @MaxLength(100)
    InvoiceNumber: string;
        
    @Field(() => Int) 
    AccountID: number;
        
    @Field(() => Int, {nullable: true}) 
    DealID?: number;
        
    @Field({description: `Date the invoice was issued`}) 
    @MaxLength(3)
    InvoiceDate: Date;
        
    @Field({description: `Payment due date for the invoice`}) 
    @MaxLength(3)
    DueDate: Date;
        
    @Field({description: `Current status of the invoice (Draft, Sent, Paid, Partial, Overdue, Cancelled)`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Float, {description: `Sum of all line items before tax`}) 
    SubTotal: number;
        
    @Field(() => Float, {nullable: true, description: `Tax rate percentage to apply to the subtotal`}) 
    TaxRate?: number;
        
    @Field(() => Float, {nullable: true, description: `Calculated field: SubTotal × TaxRate percentage`}) 
    TaxAmount?: number;
        
    @Field(() => Float, {nullable: true, description: `Calculated field: SubTotal + TaxAmount`}) 
    TotalAmount?: number;
        
    @Field(() => Float, {nullable: true, description: `Total amount paid against this invoice`}) 
    AmountPaid?: number;
        
    @Field(() => Float, {nullable: true, description: `Calculated field: TotalAmount - AmountPaid`}) 
    BalanceDue?: number;
        
    @Field({nullable: true, description: `Payment terms (e.g., Net 30, Net 15, Due on Receipt, 2/10 Net 30)`}) 
    @MaxLength(200)
    Terms?: string;
        
    @Field({nullable: true, description: `Additional notes or special instructions for the invoice`}) 
    Notes?: string;
        
    @Field({nullable: true, description: `Billing address street`}) 
    @MaxLength(200)
    BillingStreet?: string;
        
    @Field({nullable: true, description: `Billing address city`}) 
    @MaxLength(100)
    BillingCity?: string;
        
    @Field({nullable: true, description: `Billing address state or province`}) 
    @MaxLength(100)
    BillingState?: string;
        
    @Field({nullable: true, description: `Billing address postal or ZIP code`}) 
    @MaxLength(40)
    BillingPostalCode?: string;
        
    @Field({nullable: true, description: `Billing address country`}) 
    @MaxLength(100)
    BillingCountry?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Account: string;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Deal?: string;
        
    @Field(() => [CRMPayment_])
    Payments_InvoiceIDArray: CRMPayment_[]; // Link to Payments
    
    @Field(() => [CRMInvoiceLineItem_])
    InvoiceLineItems_InvoiceIDArray: CRMInvoiceLineItem_[]; // Link to InvoiceLineItems
    
}

//****************************************************************************
// INPUT TYPE for Invoices
//****************************************************************************
@InputType()
export class CreateCRMInvoiceInput {
    @Field({ nullable: true })
    InvoiceNumber?: string;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field(() => Int, { nullable: true })
    DealID: number | null;

    @Field({ nullable: true })
    InvoiceDate?: Date;

    @Field({ nullable: true })
    DueDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    SubTotal?: number;

    @Field(() => Float, { nullable: true })
    TaxRate?: number | null;

    @Field(() => Float, { nullable: true })
    AmountPaid?: number | null;

    @Field({ nullable: true })
    Terms: string | null;

    @Field({ nullable: true })
    Notes: string | null;

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
}
    

//****************************************************************************
// INPUT TYPE for Invoices
//****************************************************************************
@InputType()
export class UpdateCRMInvoiceInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    InvoiceNumber?: string;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field(() => Int, { nullable: true })
    DealID?: number | null;

    @Field({ nullable: true })
    InvoiceDate?: Date;

    @Field({ nullable: true })
    DueDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    SubTotal?: number;

    @Field(() => Float, { nullable: true })
    TaxRate?: number | null;

    @Field(() => Float, { nullable: true })
    AmountPaid?: number | null;

    @Field({ nullable: true })
    Terms?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Invoices
//****************************************************************************
@ObjectType()
export class RunCRMInvoiceViewResult {
    @Field(() => [CRMInvoice_])
    Results: CRMInvoice_[];

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

@Resolver(CRMInvoice_)
export class CRMInvoiceResolver extends ResolverBase {
    @Query(() => RunCRMInvoiceViewResult)
    async RunCRMInvoiceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMInvoiceViewResult)
    async RunCRMInvoiceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMInvoiceViewResult)
    async RunCRMInvoiceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Invoices';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMInvoice_, { nullable: true })
    async CRMInvoice(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMInvoice_ | null> {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwInvoices] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Invoices', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [CRMPayment_])
    async Payments_InvoiceIDArray(@Root() crminvoice_: CRMInvoice_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwPayments] WHERE [InvoiceID]=${crminvoice_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Payments', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMInvoiceLineItem_])
    async InvoiceLineItems_InvoiceIDArray(@Root() crminvoice_: CRMInvoice_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwInvoiceLineItems] WHERE [InvoiceID]=${crminvoice_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Invoice Line Items', rows);
        return result;
    }
        
    @Mutation(() => CRMInvoice_)
    async CreateCRMInvoice(
        @Arg('input', () => CreateCRMInvoiceInput) input: CreateCRMInvoiceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Invoices', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMInvoice_)
    async UpdateCRMInvoice(
        @Arg('input', () => UpdateCRMInvoiceInput) input: UpdateCRMInvoiceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Invoices', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMInvoice_)
    async DeleteCRMInvoice(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Invoices', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Speakers
//****************************************************************************
@ObjectType({ description: `Master table for speakers and presenters, with AI-enhanced research dossiers` })
export class EventsSpeaker_ {
    @Field({description: `Unique identifier for the speaker`}) 
    @MaxLength(16)
    ID: string;
        
    @Field(() => Int, {nullable: true, description: `Optional reference to CRM Contact record`}) 
    ContactID?: number;
        
    @Field({description: `Full name of the speaker`}) 
    @MaxLength(400)
    FullName: string;
        
    @Field({description: `Primary email address`}) 
    @MaxLength(200)
    Email: string;
        
    @Field({nullable: true, description: `Contact phone number`}) 
    @MaxLength(40)
    PhoneNumber?: string;
        
    @Field({nullable: true, description: `Professional title or position`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `Company or organization affiliation`}) 
    @MaxLength(400)
    Organization?: string;
        
    @Field({nullable: true, description: `Speaker biography as submitted`}) 
    Bio?: string;
        
    @Field({nullable: true, description: `LinkedIn profile URL`}) 
    @MaxLength(510)
    LinkedInURL?: string;
        
    @Field({nullable: true, description: `Twitter/X handle`}) 
    @MaxLength(100)
    TwitterHandle?: string;
        
    @Field({nullable: true, description: `Personal or professional website URL`}) 
    @MaxLength(510)
    WebsiteURL?: string;
        
    @Field({nullable: true, description: `URL to speaker headshot or profile photo`}) 
    @MaxLength(510)
    PhotoURL?: string;
        
    @Field({nullable: true, description: `Description of previous speaking experience as submitted`}) 
    SpeakingExperience?: string;
        
    @Field({nullable: true, description: `Timestamp when AI research was last performed on this speaker`}) 
    @MaxLength(8)
    DossierResearchedAt?: Date;
        
    @Field({nullable: true, description: `Comprehensive JSON research results from web searches and social media`}) 
    DossierJSON?: string;
        
    @Field({nullable: true, description: `AI-generated summary of speaker background and credibility`}) 
    DossierSummary?: string;
        
    @Field(() => Float, {nullable: true, description: `AI-calculated credibility score based on research (0-100)`}) 
    CredibilityScore?: number;
        
    @Field({nullable: true, description: `JSON array of previous speaking engagements discovered through research`}) 
    SpeakingHistory?: string;
        
    @Field({nullable: true, description: `JSON array of expertise topics and domains`}) 
    Expertise?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of publications, articles, or blog posts discovered`}) 
    PublicationsCount?: number;
        
    @Field(() => Int, {nullable: true, description: `Total social media followers/reach across platforms`}) 
    SocialMediaReach?: number;
        
    @Field({nullable: true, description: `JSON array of any concerns or red flags identified during research`}) 
    RedFlags?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [EventsSubmissionSpeaker_])
    SubmissionSpeakers_SpeakerIDArray: EventsSubmissionSpeaker_[]; // Link to SubmissionSpeakers
    
}

//****************************************************************************
// INPUT TYPE for Speakers
//****************************************************************************
@InputType()
export class CreateEventsSpeakerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field(() => Int, { nullable: true })
    ContactID: number | null;

    @Field({ nullable: true })
    FullName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    PhoneNumber: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    LinkedInURL: string | null;

    @Field({ nullable: true })
    TwitterHandle: string | null;

    @Field({ nullable: true })
    WebsiteURL: string | null;

    @Field({ nullable: true })
    PhotoURL: string | null;

    @Field({ nullable: true })
    SpeakingExperience: string | null;

    @Field({ nullable: true })
    DossierResearchedAt: Date | null;

    @Field({ nullable: true })
    DossierJSON: string | null;

    @Field({ nullable: true })
    DossierSummary: string | null;

    @Field(() => Float, { nullable: true })
    CredibilityScore: number | null;

    @Field({ nullable: true })
    SpeakingHistory: string | null;

    @Field({ nullable: true })
    Expertise: string | null;

    @Field(() => Int, { nullable: true })
    PublicationsCount?: number | null;

    @Field(() => Int, { nullable: true })
    SocialMediaReach?: number | null;

    @Field({ nullable: true })
    RedFlags: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Speakers
//****************************************************************************
@InputType()
export class UpdateEventsSpeakerInput {
    @Field()
    ID: string;

    @Field(() => Int, { nullable: true })
    ContactID?: number | null;

    @Field({ nullable: true })
    FullName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    PhoneNumber?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    LinkedInURL?: string | null;

    @Field({ nullable: true })
    TwitterHandle?: string | null;

    @Field({ nullable: true })
    WebsiteURL?: string | null;

    @Field({ nullable: true })
    PhotoURL?: string | null;

    @Field({ nullable: true })
    SpeakingExperience?: string | null;

    @Field({ nullable: true })
    DossierResearchedAt?: Date | null;

    @Field({ nullable: true })
    DossierJSON?: string | null;

    @Field({ nullable: true })
    DossierSummary?: string | null;

    @Field(() => Float, { nullable: true })
    CredibilityScore?: number | null;

    @Field({ nullable: true })
    SpeakingHistory?: string | null;

    @Field({ nullable: true })
    Expertise?: string | null;

    @Field(() => Int, { nullable: true })
    PublicationsCount?: number | null;

    @Field(() => Int, { nullable: true })
    SocialMediaReach?: number | null;

    @Field({ nullable: true })
    RedFlags?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Speakers
//****************************************************************************
@ObjectType()
export class RunEventsSpeakerViewResult {
    @Field(() => [EventsSpeaker_])
    Results: EventsSpeaker_[];

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

@Resolver(EventsSpeaker_)
export class EventsSpeakerResolver extends ResolverBase {
    @Query(() => RunEventsSpeakerViewResult)
    async RunEventsSpeakerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSpeakerViewResult)
    async RunEventsSpeakerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSpeakerViewResult)
    async RunEventsSpeakerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Speakers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsSpeaker_, { nullable: true })
    async EventsSpeaker(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsSpeaker_ | null> {
        this.CheckUserReadPermissions('Speakers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSpeakers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Speakers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Speakers', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [EventsSubmissionSpeaker_])
    async SubmissionSpeakers_SpeakerIDArray(@Root() eventsspeaker_: EventsSpeaker_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submission Speakers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionSpeakers] WHERE [SpeakerID]='${eventsspeaker_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Speakers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submission Speakers', rows);
        return result;
    }
        
    @Mutation(() => EventsSpeaker_)
    async CreateEventsSpeaker(
        @Arg('input', () => CreateEventsSpeakerInput) input: CreateEventsSpeakerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Speakers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsSpeaker_)
    async UpdateEventsSpeaker(
        @Arg('input', () => UpdateEventsSpeakerInput) input: UpdateEventsSpeakerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Speakers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsSpeaker_)
    async DeleteEventsSpeaker(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Speakers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType({ description: `Master table for events, conferences, and call for proposals` })
export class EventsEvent_ {
    @Field({description: `Unique identifier for the event`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({nullable: true, description: `Parent event ID for multi-day or related events`}) 
    @MaxLength(16)
    ParentID?: string;
        
    @Field({description: `Name of the event or conference`}) 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true, description: `Full description of the event`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Main theme or focus area of the conference`}) 
    @MaxLength(1000)
    ConferenceTheme?: string;
        
    @Field({nullable: true, description: `Description of target audience and their expertise levels`}) 
    @MaxLength(1000)
    TargetAudience?: string;
        
    @Field({description: `Start date and time of the event`}) 
    @MaxLength(8)
    StartDate: Date;
        
    @Field({description: `End date and time of the event`}) 
    @MaxLength(8)
    EndDate: Date;
        
    @Field({nullable: true, description: `Physical or virtual location of the event`}) 
    @MaxLength(400)
    Location?: string;
        
    @Field({description: `Current status of the event (Planning, Open for Submissions, Review, Closed, Completed, Canceled)`}) 
    @MaxLength(100)
    Status: string;
        
    @Field({description: `Deadline for submitting proposals`}) 
    @MaxLength(8)
    SubmissionDeadline: Date;
        
    @Field({nullable: true, description: `Date when speakers will be notified of acceptance/rejection`}) 
    @MaxLength(8)
    NotificationDate?: Date;
        
    @Field({nullable: true, description: `AI prompt/rubric for evaluating submissions (JSON or text)`}) 
    EvaluationRubric?: string;
        
    @Field(() => Float, {nullable: true, description: `Minimum score required to pass initial screening (0-100)`}) 
    BaselinePassingScore?: number;
        
    @Field({nullable: true, description: `JSON array of review committee member email addresses`}) 
    ReviewCommitteeEmails?: string;
        
    @Field({nullable: true, description: `Typeform form ID for submission intake`}) 
    @MaxLength(200)
    TypeformID?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Whether automated Typeform monitoring is enabled`}) 
    TypeformMonitorEnabled?: boolean;
        
    @Field(() => Int, {nullable: true, description: `How often to check Typeform for new submissions (minutes)`}) 
    TypeformCheckFrequencyMinutes?: number;
        
    @Field({nullable: true, description: `Box.com folder ID where submission files are stored`}) 
    @MaxLength(200)
    BoxFolderID?: string;
        
    @Field({nullable: true, description: `JSON array of allowed session formats (Workshop, Keynote, Panel, Lightning Talk, etc.)`}) 
    SessionFormats?: string;
        
    @Field(() => Int, {nullable: true, description: `Optional reference to CRM Account for event organization`}) 
    AccountID?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Account?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentID?: string;
        
    @Field(() => [EventsEvent_])
    Events_ParentIDArray: EventsEvent_[]; // Link to Events
    
    @Field(() => [EventsSubmission_])
    Submissions_EventIDArray: EventsSubmission_[]; // Link to Submissions
    
    @Field(() => [EventsEventReviewTask_])
    EventReviewTasks_EventIDArray: EventsEventReviewTask_[]; // Link to EventReviewTasks
    
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreateEventsEventInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ConferenceTheme: string | null;

    @Field({ nullable: true })
    TargetAudience: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    Location: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SubmissionDeadline?: Date;

    @Field({ nullable: true })
    NotificationDate: Date | null;

    @Field({ nullable: true })
    EvaluationRubric: string | null;

    @Field(() => Float, { nullable: true })
    BaselinePassingScore: number | null;

    @Field({ nullable: true })
    ReviewCommitteeEmails: string | null;

    @Field({ nullable: true })
    TypeformID: string | null;

    @Field(() => Boolean, { nullable: true })
    TypeformMonitorEnabled?: boolean | null;

    @Field(() => Int, { nullable: true })
    TypeformCheckFrequencyMinutes?: number | null;

    @Field({ nullable: true })
    BoxFolderID: string | null;

    @Field({ nullable: true })
    SessionFormats: string | null;

    @Field(() => Int, { nullable: true })
    AccountID: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdateEventsEventInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ConferenceTheme?: string | null;

    @Field({ nullable: true })
    TargetAudience?: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    Location?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SubmissionDeadline?: Date;

    @Field({ nullable: true })
    NotificationDate?: Date | null;

    @Field({ nullable: true })
    EvaluationRubric?: string | null;

    @Field(() => Float, { nullable: true })
    BaselinePassingScore?: number | null;

    @Field({ nullable: true })
    ReviewCommitteeEmails?: string | null;

    @Field({ nullable: true })
    TypeformID?: string | null;

    @Field(() => Boolean, { nullable: true })
    TypeformMonitorEnabled?: boolean | null;

    @Field(() => Int, { nullable: true })
    TypeformCheckFrequencyMinutes?: number | null;

    @Field({ nullable: true })
    BoxFolderID?: string | null;

    @Field({ nullable: true })
    SessionFormats?: string | null;

    @Field(() => Int, { nullable: true })
    AccountID?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunEventsEventViewResult {
    @Field(() => [EventsEvent_])
    Results: EventsEvent_[];

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

@Resolver(EventsEvent_)
export class EventsEventResolver extends ResolverBase {
    @Query(() => RunEventsEventViewResult)
    async RunEventsEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsEventViewResult)
    async RunEventsEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsEventViewResult)
    async RunEventsEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsEvent_, { nullable: true })
    async EventsEvent(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsEvent_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEvents] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [EventsEvent_])
    async Events_ParentIDArray(@Root() eventsevent_: EventsEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEvents] WHERE [ParentID]='${eventsevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Events', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsSubmission_])
    async Submissions_EventIDArray(@Root() eventsevent_: EventsEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissions] WHERE [EventID]='${eventsevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submissions', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsEventReviewTask_])
    async EventReviewTasks_EventIDArray(@Root() eventsevent_: EventsEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Review Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEventReviewTasks] WHERE [EventID]='${eventsevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Review Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Event Review Tasks', rows);
        return result;
    }
        
    @Mutation(() => EventsEvent_)
    async CreateEventsEvent(
        @Arg('input', () => CreateEventsEventInput) input: CreateEventsEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsEvent_)
    async UpdateEventsEvent(
        @Arg('input', () => UpdateEventsEventInput) input: UpdateEventsEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsEvent_)
    async DeleteEventsEvent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Types
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing activity type values` })
export class CRMActivityType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the activity type`}) 
    @MaxLength(100)
    Name: string;
        
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
export class CreateCRMActivityTypeInput {
    @Field({ nullable: true })
    Name?: string;
}
    

//****************************************************************************
// INPUT TYPE for Activity Types
//****************************************************************************
@InputType()
export class UpdateCRMActivityTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Types
//****************************************************************************
@ObjectType()
export class RunCRMActivityTypeViewResult {
    @Field(() => [CRMActivityType_])
    Results: CRMActivityType_[];

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

@Resolver(CRMActivityType_)
export class CRMActivityTypeResolver extends ResolverBase {
    @Query(() => RunCRMActivityTypeViewResult)
    async RunCRMActivityTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMActivityTypeViewResult)
    async RunCRMActivityTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMActivityTypeViewResult)
    async RunCRMActivityTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMActivityType_, { nullable: true })
    async CRMActivityType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMActivityType_ | null> {
        this.CheckUserReadPermissions('Activity Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivityTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Activity Types', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMActivityType_)
    async CreateCRMActivityType(
        @Arg('input', () => CreateCRMActivityTypeInput) input: CreateCRMActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMActivityType_)
    async UpdateCRMActivityType(
        @Arg('input', () => UpdateCRMActivityTypeInput) input: UpdateCRMActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMActivityType_)
    async DeleteCRMActivityType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Accounts
//****************************************************************************
@ObjectType({ description: `Stores information about customer organizations and companies` })
export class CRMAccount_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Official name of the organization or company`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Industry sector the account belongs to`}) 
    @MaxLength(100)
    Industry?: string;
        
    @Field(() => Float, {nullable: true, description: `Estimated annual revenue of the account in local currency`}) 
    AnnualRevenue?: number;
        
    @Field({nullable: true, description: `Stock ticker symbol for publicly traded companies`}) 
    @MaxLength(20)
    TickerSymbol?: string;
        
    @Field({nullable: true, description: `Stock exchange where company is listed (NYSE, NASDAQ, AMEX, LSE, TSE, HKEX, SSE, Other)`}) 
    @MaxLength(40)
    Exchange?: string;
        
    @Field(() => Int, {nullable: true, description: `Approximate number of employees`}) 
    EmployeeCount?: number;
        
    @Field(() => Int, {nullable: true, description: `Year the company was founded`}) 
    Founded?: number;
        
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
        
    @Field(() => [CRMInvoice_])
    Invoices_AccountIDArray: CRMInvoice_[]; // Link to Invoices
    
    @Field(() => [CRMContact_])
    Contacts_AccountIDArray: CRMContact_[]; // Link to Contacts
    
    @Field(() => [CRMAccountInsight_])
    AccountInsights_AccountIDArray: CRMAccountInsight_[]; // Link to AccountInsights
    
    @Field(() => [CRMActivity_])
    Activities_AccountIDArray: CRMActivity_[]; // Link to Activities
    
    @Field(() => [EventsEvent_])
    Events_AccountIDArray: EventsEvent_[]; // Link to Events
    
    @Field(() => [CRMDeal_])
    Deals_AccountIDArray: CRMDeal_[]; // Link to Deals
    
}

//****************************************************************************
// INPUT TYPE for Accounts
//****************************************************************************
@InputType()
export class CreateCRMAccountInput {
    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Industry: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue: number | null;

    @Field({ nullable: true })
    TickerSymbol: string | null;

    @Field({ nullable: true })
    Exchange: string | null;

    @Field(() => Int, { nullable: true })
    EmployeeCount: number | null;

    @Field(() => Int, { nullable: true })
    Founded: number | null;

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
export class UpdateCRMAccountInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue?: number | null;

    @Field({ nullable: true })
    TickerSymbol?: string | null;

    @Field({ nullable: true })
    Exchange?: string | null;

    @Field(() => Int, { nullable: true })
    EmployeeCount?: number | null;

    @Field(() => Int, { nullable: true })
    Founded?: number | null;

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
export class RunCRMAccountViewResult {
    @Field(() => [CRMAccount_])
    Results: CRMAccount_[];

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

@Resolver(CRMAccount_)
export class CRMAccountResolver extends ResolverBase {
    @Query(() => RunCRMAccountViewResult)
    async RunCRMAccountViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountViewResult)
    async RunCRMAccountViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountViewResult)
    async RunCRMAccountDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Accounts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMAccount_, { nullable: true })
    async CRMAccount(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMAccount_ | null> {
        this.CheckUserReadPermissions('Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccounts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Accounts', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [CRMInvoice_])
    async Invoices_AccountIDArray(@Root() crmaccount_: CRMAccount_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwInvoices] WHERE [AccountID]=${crmaccount_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Invoices', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMContact_])
    async Contacts_AccountIDArray(@Root() crmaccount_: CRMAccount_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts] WHERE [AccountID]=${crmaccount_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMAccountInsight_])
    async AccountInsights_AccountIDArray(@Root() crmaccount_: CRMAccount_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Account Insights', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountInsights] WHERE [AccountID]=${crmaccount_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Insights', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Account Insights', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMActivity_])
    async Activities_AccountIDArray(@Root() crmaccount_: CRMAccount_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivities] WHERE [AccountID]=${crmaccount_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsEvent_])
    async Events_AccountIDArray(@Root() crmaccount_: CRMAccount_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEvents] WHERE [AccountID]=${crmaccount_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Events', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMDeal_])
    async Deals_AccountIDArray(@Root() crmaccount_: CRMAccount_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDeals] WHERE [AccountID]=${crmaccount_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', rows);
        return result;
    }
        
    @Mutation(() => CRMAccount_)
    async CreateCRMAccount(
        @Arg('input', () => CreateCRMAccountInput) input: CreateCRMAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Accounts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMAccount_)
    async UpdateCRMAccount(
        @Arg('input', () => UpdateCRMAccountInput) input: UpdateCRMAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Accounts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMAccount_)
    async DeleteCRMAccount(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Accounts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Relationships
//****************************************************************************
@ObjectType({ description: `Stores relationship connections between contacts` })
export class CRMContactRelationship_ {
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
        
    @Field() 
    @MaxLength(100)
    RelationshipType: string;
        
}

//****************************************************************************
// INPUT TYPE for Contact Relationships
//****************************************************************************
@InputType()
export class CreateCRMContactRelationshipInput {
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
export class UpdateCRMContactRelationshipInput {
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
export class RunCRMContactRelationshipViewResult {
    @Field(() => [CRMContactRelationship_])
    Results: CRMContactRelationship_[];

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

@Resolver(CRMContactRelationship_)
export class CRMContactRelationshipResolver extends ResolverBase {
    @Query(() => RunCRMContactRelationshipViewResult)
    async RunCRMContactRelationshipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMContactRelationshipViewResult)
    async RunCRMContactRelationshipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMContactRelationshipViewResult)
    async RunCRMContactRelationshipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Relationships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMContactRelationship_, { nullable: true })
    async CRMContactRelationship(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMContactRelationship_ | null> {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contact Relationships', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMContactRelationship_)
    async CreateCRMContactRelationship(
        @Arg('input', () => CreateCRMContactRelationshipInput) input: CreateCRMContactRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Relationships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMContactRelationship_)
    async UpdateCRMContactRelationship(
        @Arg('input', () => UpdateCRMContactRelationshipInput) input: UpdateCRMContactRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Relationships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMContactRelationship_)
    async DeleteCRMContactRelationship(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Relationships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType({ description: `Tracks interactions with contacts and accounts` })
export class CRMActivity_ {
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
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Account?: string;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreateCRMActivityInput {
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
export class UpdateCRMActivityInput {
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
export class RunCRMActivityViewResult {
    @Field(() => [CRMActivity_])
    Results: CRMActivity_[];

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

@Resolver(CRMActivity_)
export class CRMActivityResolver extends ResolverBase {
    @Query(() => RunCRMActivityViewResult)
    async RunCRMActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMActivityViewResult)
    async RunCRMActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMActivityViewResult)
    async RunCRMActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMActivity_, { nullable: true })
    async CRMActivity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMActivity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwActivities] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMActivity_)
    async CreateCRMActivity(
        @Arg('input', () => CreateCRMActivityInput) input: CreateCRMActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMActivity_)
    async UpdateCRMActivity(
        @Arg('input', () => UpdateCRMActivityInput) input: UpdateCRMActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMActivity_)
    async DeleteCRMActivity(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deals
//****************************************************************************
@ObjectType({ description: `Sales opportunities and deals in various stages of the sales pipeline` })
export class CRMDeal_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Descriptive name for the deal or opportunity`}) 
    @MaxLength(400)
    Name: string;
        
    @Field(() => Int) 
    AccountID: number;
        
    @Field(() => Int, {nullable: true}) 
    ContactID?: number;
        
    @Field({description: `Current stage in the sales pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)`}) 
    @MaxLength(100)
    Stage: string;
        
    @Field(() => Float, {nullable: true, description: `Total potential value of the deal in local currency`}) 
    Amount?: number;
        
    @Field(() => Int, {nullable: true, description: `Estimated probability of closing the deal (0-100 percent)`}) 
    Probability?: number;
        
    @Field(() => Float, {nullable: true, description: `Calculated field: Amount multiplied by Probability percentage`}) 
    ExpectedRevenue?: number;
        
    @Field({nullable: true, description: `Target date for closing the deal`}) 
    @MaxLength(3)
    CloseDate?: Date;
        
    @Field({nullable: true, description: `Actual date the deal was closed (won or lost)`}) 
    @MaxLength(3)
    ActualCloseDate?: Date;
        
    @Field({nullable: true, description: `Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)`}) 
    @MaxLength(100)
    DealSource?: string;
        
    @Field({nullable: true, description: `Name of competing company or solution being considered`}) 
    @MaxLength(200)
    Competitor?: string;
        
    @Field({nullable: true, description: `Reason for losing the deal if Stage is Closed Lost`}) 
    @MaxLength(400)
    LossReason?: string;
        
    @Field({nullable: true, description: `Description of the next action to be taken for this deal`}) 
    @MaxLength(1000)
    NextStep?: string;
        
    @Field({nullable: true, description: `Detailed description of the deal, requirements, and notes`}) 
    Description?: string;
        
    @Field(() => Int, {nullable: true, description: `Sales representative or owner responsible for this deal`}) 
    OwnerID?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Account: string;
        
    @Field(() => [CRMDealProduct_])
    DealProducts_DealIDArray: CRMDealProduct_[]; // Link to DealProducts
    
    @Field(() => [CRMInvoice_])
    Invoices_DealIDArray: CRMInvoice_[]; // Link to Invoices
    
}

//****************************************************************************
// INPUT TYPE for Deals
//****************************************************************************
@InputType()
export class CreateCRMDealInput {
    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field(() => Int, { nullable: true })
    ContactID: number | null;

    @Field({ nullable: true })
    Stage?: string;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field(() => Int, { nullable: true })
    Probability: number | null;

    @Field({ nullable: true })
    CloseDate: Date | null;

    @Field({ nullable: true })
    ActualCloseDate: Date | null;

    @Field({ nullable: true })
    DealSource: string | null;

    @Field({ nullable: true })
    Competitor: string | null;

    @Field({ nullable: true })
    LossReason: string | null;

    @Field({ nullable: true })
    NextStep: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    OwnerID: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Deals
//****************************************************************************
@InputType()
export class UpdateCRMDealInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field(() => Int, { nullable: true })
    ContactID?: number | null;

    @Field({ nullable: true })
    Stage?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field(() => Int, { nullable: true })
    Probability?: number | null;

    @Field({ nullable: true })
    CloseDate?: Date | null;

    @Field({ nullable: true })
    ActualCloseDate?: Date | null;

    @Field({ nullable: true })
    DealSource?: string | null;

    @Field({ nullable: true })
    Competitor?: string | null;

    @Field({ nullable: true })
    LossReason?: string | null;

    @Field({ nullable: true })
    NextStep?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    OwnerID?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deals
//****************************************************************************
@ObjectType()
export class RunCRMDealViewResult {
    @Field(() => [CRMDeal_])
    Results: CRMDeal_[];

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

@Resolver(CRMDeal_)
export class CRMDealResolver extends ResolverBase {
    @Query(() => RunCRMDealViewResult)
    async RunCRMDealViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMDealViewResult)
    async RunCRMDealViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMDealViewResult)
    async RunCRMDealDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMDeal_, { nullable: true })
    async CRMDeal(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMDeal_ | null> {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDeals] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Deals', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [CRMDealProduct_])
    async DealProducts_DealIDArray(@Root() crmdeal_: CRMDeal_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDealProducts] WHERE [DealID]=${crmdeal_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Deal Products', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMInvoice_])
    async Invoices_DealIDArray(@Root() crmdeal_: CRMDeal_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwInvoices] WHERE [DealID]=${crmdeal_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Invoices', rows);
        return result;
    }
        
    @Mutation(() => CRMDeal_)
    async CreateCRMDeal(
        @Arg('input', () => CreateCRMDealInput) input: CreateCRMDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMDeal_)
    async UpdateCRMDeal(
        @Arg('input', () => UpdateCRMDealInput) input: UpdateCRMDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMDeal_)
    async DeleteCRMDeal(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Deals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Relationship Types
//****************************************************************************
@ObjectType({ description: `Lookup table for defining relationship types between contacts and their inverse relationships` })
export class CRMRelationshipType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the relationship type (e.g., Parent, Child, Spouse)`}) 
    @MaxLength(100)
    Name: string;
        
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
        
    @Field({nullable: true}) 
    @MaxLength(100)
    InverseRelationship?: string;
        
    @Field(() => Int, {nullable: true}) 
    RootInverseRelationshipID?: number;
        
    @Field(() => [CRMRelationshipType_])
    RelationshipTypes_InverseRelationshipIDArray: CRMRelationshipType_[]; // Link to RelationshipTypes
    
    @Field(() => [CRMContactRelationship_])
    ContactRelationships_RelationshipTypeIDArray: CRMContactRelationship_[]; // Link to ContactRelationships
    
}

//****************************************************************************
// INPUT TYPE for Relationship Types
//****************************************************************************
@InputType()
export class CreateCRMRelationshipTypeInput {
    @Field({ nullable: true })
    Name?: string;

    @Field(() => Boolean, { nullable: true })
    IsBidirectional?: boolean;

    @Field(() => Int, { nullable: true })
    InverseRelationshipID: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Relationship Types
//****************************************************************************
@InputType()
export class UpdateCRMRelationshipTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

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
export class RunCRMRelationshipTypeViewResult {
    @Field(() => [CRMRelationshipType_])
    Results: CRMRelationshipType_[];

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

@Resolver(CRMRelationshipType_)
export class CRMRelationshipTypeResolver extends ResolverBase {
    @Query(() => RunCRMRelationshipTypeViewResult)
    async RunCRMRelationshipTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMRelationshipTypeViewResult)
    async RunCRMRelationshipTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMRelationshipTypeViewResult)
    async RunCRMRelationshipTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Relationship Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMRelationshipType_, { nullable: true })
    async CRMRelationshipType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMRelationshipType_ | null> {
        this.CheckUserReadPermissions('Relationship Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwRelationshipTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Relationship Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Relationship Types', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [CRMRelationshipType_])
    async RelationshipTypes_InverseRelationshipIDArray(@Root() crmrelationshiptype_: CRMRelationshipType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Relationship Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwRelationshipTypes] WHERE [InverseRelationshipID]=${crmrelationshiptype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Relationship Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Relationship Types', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMContactRelationship_])
    async ContactRelationships_RelationshipTypeIDArray(@Root() crmrelationshiptype_: CRMRelationshipType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContactRelationships] WHERE [RelationshipTypeID]=${crmrelationshiptype_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Contact Relationships', rows);
        return result;
    }
        
    @Mutation(() => CRMRelationshipType_)
    async CreateCRMRelationshipType(
        @Arg('input', () => CreateCRMRelationshipTypeInput) input: CreateCRMRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Relationship Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMRelationshipType_)
    async UpdateCRMRelationshipType(
        @Arg('input', () => UpdateCRMRelationshipTypeInput) input: UpdateCRMRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Relationship Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMRelationshipType_)
    async DeleteCRMRelationshipType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Relationship Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Submission Notifications
//****************************************************************************
@ObjectType({ description: `Audit trail of all notifications sent to speakers regarding their submissions` })
export class EventsSubmissionNotification_ {
    @Field({description: `Unique identifier for the notification`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Submission this notification is about`}) 
    @MaxLength(16)
    SubmissionID: string;
        
    @Field({description: `Type of notification (Initial Received, Failed Screening, Passed to Review, Request Resubmission, Accepted, Rejected, Waitlisted, Reminder)`}) 
    @MaxLength(100)
    NotificationType: string;
        
    @Field({description: `Timestamp when notification was sent`}) 
    @MaxLength(8)
    SentAt: Date;
        
    @Field({description: `Email address of recipient`}) 
    @MaxLength(200)
    RecipientEmail: string;
        
    @Field({nullable: true, description: `Email subject line`}) 
    @MaxLength(1000)
    Subject?: string;
        
    @Field({nullable: true, description: `Full email message body`}) 
    MessageBody?: string;
        
    @Field({nullable: true, description: `Delivery status from email system (Pending, Sent, Delivered, Bounced, Failed)`}) 
    @MaxLength(100)
    DeliveryStatus?: string;
        
    @Field({nullable: true, description: `Timestamp when recipient clicked a link in the email (for engagement tracking)`}) 
    @MaxLength(8)
    ClickedAt?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Submission Notifications
//****************************************************************************
@InputType()
export class CreateEventsSubmissionNotificationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field({ nullable: true })
    NotificationType?: string;

    @Field({ nullable: true })
    SentAt?: Date;

    @Field({ nullable: true })
    RecipientEmail?: string;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    MessageBody: string | null;

    @Field({ nullable: true })
    DeliveryStatus?: string | null;

    @Field({ nullable: true })
    ClickedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Submission Notifications
//****************************************************************************
@InputType()
export class UpdateEventsSubmissionNotificationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SubmissionID?: string;

    @Field({ nullable: true })
    NotificationType?: string;

    @Field({ nullable: true })
    SentAt?: Date;

    @Field({ nullable: true })
    RecipientEmail?: string;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    MessageBody?: string | null;

    @Field({ nullable: true })
    DeliveryStatus?: string | null;

    @Field({ nullable: true })
    ClickedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Submission Notifications
//****************************************************************************
@ObjectType()
export class RunEventsSubmissionNotificationViewResult {
    @Field(() => [EventsSubmissionNotification_])
    Results: EventsSubmissionNotification_[];

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

@Resolver(EventsSubmissionNotification_)
export class EventsSubmissionNotificationResolver extends ResolverBase {
    @Query(() => RunEventsSubmissionNotificationViewResult)
    async RunEventsSubmissionNotificationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionNotificationViewResult)
    async RunEventsSubmissionNotificationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionNotificationViewResult)
    async RunEventsSubmissionNotificationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Submission Notifications';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsSubmissionNotification_, { nullable: true })
    async EventsSubmissionNotification(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsSubmissionNotification_ | null> {
        this.CheckUserReadPermissions('Submission Notifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionNotifications] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Notifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Submission Notifications', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => EventsSubmissionNotification_)
    async CreateEventsSubmissionNotification(
        @Arg('input', () => CreateEventsSubmissionNotificationInput) input: CreateEventsSubmissionNotificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Submission Notifications', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsSubmissionNotification_)
    async UpdateEventsSubmissionNotification(
        @Arg('input', () => UpdateEventsSubmissionNotificationInput) input: UpdateEventsSubmissionNotificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Submission Notifications', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsSubmissionNotification_)
    async DeleteEventsSubmissionNotification(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Submission Notifications', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Submissions
//****************************************************************************
@ObjectType({ description: `Abstract submissions for events with AI-powered evaluation and human review tracking` })
export class EventsSubmission_ {
    @Field({description: `Unique identifier for the submission`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Event this submission is for`}) 
    @MaxLength(16)
    EventID: string;
        
    @Field({nullable: true, description: `External response ID from Typeform`}) 
    @MaxLength(200)
    TypeformResponseID?: string;
        
    @Field({description: `Timestamp when submission was received`}) 
    @MaxLength(8)
    SubmittedAt: Date;
        
    @Field({description: `Current status in workflow (New, Analyzing, Passed Initial, Failed Initial, Under Review, Accepted, Rejected, Waitlisted, Resubmitted)`}) 
    @MaxLength(100)
    Status: string;
        
    @Field({description: `Title of the proposed session or talk`}) 
    @MaxLength(1000)
    SubmissionTitle: string;
        
    @Field({description: `Full abstract or proposal text as submitted`}) 
    SubmissionAbstract: string;
        
    @Field({nullable: true, description: `AI-generated concise summary of the abstract`}) 
    SubmissionSummary?: string;
        
    @Field({nullable: true, description: `Format of the proposed session (Workshop, Keynote, Panel, Lightning Talk, Tutorial, Presentation, Roundtable, Other)`}) 
    @MaxLength(100)
    SessionFormat?: string;
        
    @Field(() => Int, {nullable: true, description: `Duration in minutes`}) 
    Duration?: number;
        
    @Field({nullable: true, description: `Target audience expertise level (Beginner, Intermediate, Advanced, All Levels)`}) 
    @MaxLength(100)
    TargetAudienceLevel?: string;
        
    @Field({nullable: true, description: `JSON array of key topics extracted by AI`}) 
    KeyTopics?: string;
        
    @Field({nullable: true, description: `URL to presentation file in Box.com`}) 
    @MaxLength(1000)
    PresentationFileURL?: string;
        
    @Field({nullable: true, description: `AI-generated summary of presentation slides/materials`}) 
    PresentationFileSummary?: string;
        
    @Field({nullable: true, description: `JSON array of additional material URLs`}) 
    AdditionalMaterialsURLs?: string;
        
    @Field({nullable: true, description: `Any special requirements (AV equipment, accessibility needs, etc.)`}) 
    SpecialRequirements?: string;
        
    @Field(() => Float, {nullable: true, description: `Overall AI evaluation score (0-100)`}) 
    AIEvaluationScore?: number;
        
    @Field({nullable: true, description: `Detailed AI explanation of evaluation and score`}) 
    AIEvaluationReasoning?: string;
        
    @Field({nullable: true, description: `JSON object with scores per rubric dimension (relevance, quality, experience, etc.)`}) 
    AIEvaluationDimensions?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Whether submission passed baseline screening criteria`}) 
    PassedInitialScreening?: boolean;
        
    @Field({nullable: true, description: `JSON array of specific failure reasons if screening failed`}) 
    FailureReasons?: string;
        
    @Field(() => Boolean, {nullable: true, description: `Whether identified issues can be fixed via resubmission`}) 
    IsFixable?: boolean;
        
    @Field({nullable: true, description: `Reference to original submission if this is a resubmission`}) 
    @MaxLength(16)
    ResubmissionOfID?: string;
        
    @Field({nullable: true, description: `Notes added by human reviewers during evaluation`}) 
    ReviewNotes?: string;
        
    @Field({nullable: true, description: `Final decision on submission (Accepted, Rejected, Waitlisted)`}) 
    @MaxLength(100)
    FinalDecision?: string;
        
    @Field({nullable: true, description: `Date when final decision was made`}) 
    @MaxLength(8)
    FinalDecisionDate?: Date;
        
    @Field({nullable: true, description: `Explanation for final decision`}) 
    FinalDecisionReasoning?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Event: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootResubmissionOfID?: string;
        
    @Field(() => [EventsSubmissionNotification_])
    SubmissionNotifications_SubmissionIDArray: EventsSubmissionNotification_[]; // Link to SubmissionNotifications
    
    @Field(() => [EventsSubmission_])
    Submissions_ResubmissionOfIDArray: EventsSubmission_[]; // Link to Submissions
    
    @Field(() => [EventsSubmissionSpeaker_])
    SubmissionSpeakers_SubmissionIDArray: EventsSubmissionSpeaker_[]; // Link to SubmissionSpeakers
    
    @Field(() => [EventsSubmissionReview_])
    SubmissionReviews_SubmissionIDArray: EventsSubmissionReview_[]; // Link to SubmissionReviews
    
    @Field(() => [EventsEventReviewTask_])
    EventReviewTasks_SubmissionIDArray: EventsEventReviewTask_[]; // Link to EventReviewTasks
    
}

//****************************************************************************
// INPUT TYPE for Submissions
//****************************************************************************
@InputType()
export class CreateEventsSubmissionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    TypeformResponseID: string | null;

    @Field({ nullable: true })
    SubmittedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SubmissionTitle?: string;

    @Field({ nullable: true })
    SubmissionAbstract?: string;

    @Field({ nullable: true })
    SubmissionSummary: string | null;

    @Field({ nullable: true })
    SessionFormat: string | null;

    @Field(() => Int, { nullable: true })
    Duration: number | null;

    @Field({ nullable: true })
    TargetAudienceLevel: string | null;

    @Field({ nullable: true })
    KeyTopics: string | null;

    @Field({ nullable: true })
    PresentationFileURL: string | null;

    @Field({ nullable: true })
    PresentationFileSummary: string | null;

    @Field({ nullable: true })
    AdditionalMaterialsURLs: string | null;

    @Field({ nullable: true })
    SpecialRequirements: string | null;

    @Field(() => Float, { nullable: true })
    AIEvaluationScore: number | null;

    @Field({ nullable: true })
    AIEvaluationReasoning: string | null;

    @Field({ nullable: true })
    AIEvaluationDimensions: string | null;

    @Field(() => Boolean, { nullable: true })
    PassedInitialScreening?: boolean | null;

    @Field({ nullable: true })
    FailureReasons: string | null;

    @Field(() => Boolean, { nullable: true })
    IsFixable: boolean | null;

    @Field({ nullable: true })
    ResubmissionOfID: string | null;

    @Field({ nullable: true })
    ReviewNotes: string | null;

    @Field({ nullable: true })
    FinalDecision: string | null;

    @Field({ nullable: true })
    FinalDecisionDate: Date | null;

    @Field({ nullable: true })
    FinalDecisionReasoning: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Submissions
//****************************************************************************
@InputType()
export class UpdateEventsSubmissionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    TypeformResponseID?: string | null;

    @Field({ nullable: true })
    SubmittedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SubmissionTitle?: string;

    @Field({ nullable: true })
    SubmissionAbstract?: string;

    @Field({ nullable: true })
    SubmissionSummary?: string | null;

    @Field({ nullable: true })
    SessionFormat?: string | null;

    @Field(() => Int, { nullable: true })
    Duration?: number | null;

    @Field({ nullable: true })
    TargetAudienceLevel?: string | null;

    @Field({ nullable: true })
    KeyTopics?: string | null;

    @Field({ nullable: true })
    PresentationFileURL?: string | null;

    @Field({ nullable: true })
    PresentationFileSummary?: string | null;

    @Field({ nullable: true })
    AdditionalMaterialsURLs?: string | null;

    @Field({ nullable: true })
    SpecialRequirements?: string | null;

    @Field(() => Float, { nullable: true })
    AIEvaluationScore?: number | null;

    @Field({ nullable: true })
    AIEvaluationReasoning?: string | null;

    @Field({ nullable: true })
    AIEvaluationDimensions?: string | null;

    @Field(() => Boolean, { nullable: true })
    PassedInitialScreening?: boolean | null;

    @Field({ nullable: true })
    FailureReasons?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsFixable?: boolean | null;

    @Field({ nullable: true })
    ResubmissionOfID?: string | null;

    @Field({ nullable: true })
    ReviewNotes?: string | null;

    @Field({ nullable: true })
    FinalDecision?: string | null;

    @Field({ nullable: true })
    FinalDecisionDate?: Date | null;

    @Field({ nullable: true })
    FinalDecisionReasoning?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Submissions
//****************************************************************************
@ObjectType()
export class RunEventsSubmissionViewResult {
    @Field(() => [EventsSubmission_])
    Results: EventsSubmission_[];

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

@Resolver(EventsSubmission_)
export class EventsSubmissionResolver extends ResolverBase {
    @Query(() => RunEventsSubmissionViewResult)
    async RunEventsSubmissionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionViewResult)
    async RunEventsSubmissionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunEventsSubmissionViewResult)
    async RunEventsSubmissionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Submissions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => EventsSubmission_, { nullable: true })
    async EventsSubmission(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EventsSubmission_ | null> {
        this.CheckUserReadPermissions('Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Submissions', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [EventsSubmissionNotification_])
    async SubmissionNotifications_SubmissionIDArray(@Root() eventssubmission_: EventsSubmission_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submission Notifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionNotifications] WHERE [SubmissionID]='${eventssubmission_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Notifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submission Notifications', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsSubmission_])
    async Submissions_ResubmissionOfIDArray(@Root() eventssubmission_: EventsSubmission_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submissions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissions] WHERE [ResubmissionOfID]='${eventssubmission_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submissions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submissions', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsSubmissionSpeaker_])
    async SubmissionSpeakers_SubmissionIDArray(@Root() eventssubmission_: EventsSubmission_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submission Speakers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionSpeakers] WHERE [SubmissionID]='${eventssubmission_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Speakers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submission Speakers', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsSubmissionReview_])
    async SubmissionReviews_SubmissionIDArray(@Root() eventssubmission_: EventsSubmission_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Submission Reviews', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwSubmissionReviews] WHERE [SubmissionID]='${eventssubmission_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Submission Reviews', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Submission Reviews', rows);
        return result;
    }
        
    @FieldResolver(() => [EventsEventReviewTask_])
    async EventReviewTasks_SubmissionIDArray(@Root() eventssubmission_: EventsSubmission_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Review Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Events].[vwEventReviewTasks] WHERE [SubmissionID]='${eventssubmission_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Review Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Event Review Tasks', rows);
        return result;
    }
        
    @Mutation(() => EventsSubmission_)
    async CreateEventsSubmission(
        @Arg('input', () => CreateEventsSubmissionInput) input: CreateEventsSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Submissions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => EventsSubmission_)
    async UpdateEventsSubmission(
        @Arg('input', () => UpdateEventsSubmissionInput) input: UpdateEventsSubmissionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Submissions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => EventsSubmission_)
    async DeleteEventsSubmission(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Submissions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Invoice Line Items
//****************************************************************************
@ObjectType({ description: `Individual line items that appear on an invoice` })
export class CRMInvoiceLineItem_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    InvoiceID: number;
        
    @Field(() => Int, {nullable: true}) 
    ProductID?: number;
        
    @Field({description: `Description of the product or service being invoiced`}) 
    @MaxLength(1000)
    Description: string;
        
    @Field(() => Float, {description: `Number of units being invoiced`}) 
    Quantity: number;
        
    @Field(() => Float, {description: `Price per unit for this line item`}) 
    UnitPrice: number;
        
    @Field(() => Float, {nullable: true, description: `Discount percentage applied to this line item (0-100)`}) 
    Discount?: number;
        
    @Field(() => Float, {nullable: true, description: `Calculated field: Quantity × UnitPrice × (1 - Discount percentage)`}) 
    TotalPrice?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Product?: string;
        
}

//****************************************************************************
// INPUT TYPE for Invoice Line Items
//****************************************************************************
@InputType()
export class CreateCRMInvoiceLineItemInput {
    @Field(() => Int, { nullable: true })
    InvoiceID?: number;

    @Field(() => Int, { nullable: true })
    ProductID: number | null;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Discount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Invoice Line Items
//****************************************************************************
@InputType()
export class UpdateCRMInvoiceLineItemInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    InvoiceID?: number;

    @Field(() => Int, { nullable: true })
    ProductID?: number | null;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Discount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Invoice Line Items
//****************************************************************************
@ObjectType()
export class RunCRMInvoiceLineItemViewResult {
    @Field(() => [CRMInvoiceLineItem_])
    Results: CRMInvoiceLineItem_[];

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

@Resolver(CRMInvoiceLineItem_)
export class CRMInvoiceLineItemResolver extends ResolverBase {
    @Query(() => RunCRMInvoiceLineItemViewResult)
    async RunCRMInvoiceLineItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMInvoiceLineItemViewResult)
    async RunCRMInvoiceLineItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMInvoiceLineItemViewResult)
    async RunCRMInvoiceLineItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Invoice Line Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMInvoiceLineItem_, { nullable: true })
    async CRMInvoiceLineItem(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMInvoiceLineItem_ | null> {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwInvoiceLineItems] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Invoice Line Items', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMInvoiceLineItem_)
    async CreateCRMInvoiceLineItem(
        @Arg('input', () => CreateCRMInvoiceLineItemInput) input: CreateCRMInvoiceLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Invoice Line Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMInvoiceLineItem_)
    async UpdateCRMInvoiceLineItem(
        @Arg('input', () => UpdateCRMInvoiceLineItemInput) input: UpdateCRMInvoiceLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Invoice Line Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMInvoiceLineItem_)
    async DeleteCRMInvoiceLineItem(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Invoice Line Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Types
//****************************************************************************
@ObjectType({ description: `Lookup table for standardizing account type values` })
export class CRMAccountType_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Name of the account type`}) 
    @MaxLength(100)
    Name: string;
        
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
export class CreateCRMAccountTypeInput {
    @Field({ nullable: true })
    Name?: string;
}
    

//****************************************************************************
// INPUT TYPE for Account Types
//****************************************************************************
@InputType()
export class UpdateCRMAccountTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Account Types
//****************************************************************************
@ObjectType()
export class RunCRMAccountTypeViewResult {
    @Field(() => [CRMAccountType_])
    Results: CRMAccountType_[];

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

@Resolver(CRMAccountType_)
export class CRMAccountTypeResolver extends ResolverBase {
    @Query(() => RunCRMAccountTypeViewResult)
    async RunCRMAccountTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountTypeViewResult)
    async RunCRMAccountTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMAccountTypeViewResult)
    async RunCRMAccountTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMAccountType_, { nullable: true })
    async CRMAccountType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMAccountType_ | null> {
        this.CheckUserReadPermissions('Account Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwAccountTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Account Types', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => CRMAccountType_)
    async CreateCRMAccountType(
        @Arg('input', () => CreateCRMAccountTypeInput) input: CreateCRMAccountTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMAccountType_)
    async UpdateCRMAccountType(
        @Arg('input', () => UpdateCRMAccountTypeInput) input: UpdateCRMAccountTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMAccountType_)
    async DeleteCRMAccountType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products
//****************************************************************************
@ObjectType({ description: `Master catalog of products and services offered by the organization` })
export class CRMProduct_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({description: `Unique identifier code for the product, used in external systems and reports`}) 
    @MaxLength(100)
    ProductCode: string;
        
    @Field({description: `Display name of the product or service`}) 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true, description: `Product category for grouping and analysis (e.g., Advertising, Sponsorship, Events, Publications)`}) 
    @MaxLength(200)
    Category?: string;
        
    @Field({nullable: true, description: `Detailed description of the product features and benefits`}) 
    Description?: string;
        
    @Field(() => Float, {description: `Standard selling price per unit in local currency`}) 
    UnitPrice: number;
        
    @Field(() => Float, {nullable: true, description: `Internal cost per unit for margin calculations`}) 
    Cost?: number;
        
    @Field(() => Boolean, {nullable: true, description: `Indicates if the product is currently available for sale`}) 
    IsActive?: boolean;
        
    @Field({nullable: true, description: `Stock Keeping Unit identifier for inventory tracking`}) 
    @MaxLength(100)
    SKU?: string;
        
    @Field({nullable: true, description: `How the product is measured and sold (Each, Hour, License, Subscription, User, GB, Unit)`}) 
    @MaxLength(40)
    UnitOfMeasure?: string;
        
    @Field({nullable: true, description: `Billing frequency for subscription products (NULL for one-time, Monthly, Quarterly, Annual, Biannual)`}) 
    @MaxLength(40)
    RecurringBillingPeriod?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [CRMDealProduct_])
    DealProducts_ProductIDArray: CRMDealProduct_[]; // Link to DealProducts
    
    @Field(() => [CRMInvoiceLineItem_])
    InvoiceLineItems_ProductIDArray: CRMInvoiceLineItem_[]; // Link to InvoiceLineItems
    
}

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class CreateCRMProductInput {
    @Field({ nullable: true })
    ProductCode?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Category: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Cost: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field({ nullable: true })
    SKU: string | null;

    @Field({ nullable: true })
    UnitOfMeasure: string | null;

    @Field({ nullable: true })
    RecurringBillingPeriod: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class UpdateCRMProductInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    ProductCode?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Category?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Cost?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field({ nullable: true })
    SKU?: string | null;

    @Field({ nullable: true })
    UnitOfMeasure?: string | null;

    @Field({ nullable: true })
    RecurringBillingPeriod?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products
//****************************************************************************
@ObjectType()
export class RunCRMProductViewResult {
    @Field(() => [CRMProduct_])
    Results: CRMProduct_[];

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

@Resolver(CRMProduct_)
export class CRMProductResolver extends ResolverBase {
    @Query(() => RunCRMProductViewResult)
    async RunCRMProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMProductViewResult)
    async RunCRMProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCRMProductViewResult)
    async RunCRMProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMProduct_, { nullable: true })
    async CRMProduct(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMProduct_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwProducts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [CRMDealProduct_])
    async DealProducts_ProductIDArray(@Root() crmproduct_: CRMProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwDealProducts] WHERE [ProductID]=${crmproduct_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Deal Products', rows);
        return result;
    }
        
    @FieldResolver(() => [CRMInvoiceLineItem_])
    async InvoiceLineItems_ProductIDArray(@Root() crmproduct_: CRMProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwInvoiceLineItems] WHERE [ProductID]=${crmproduct_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Invoice Line Items', rows);
        return result;
    }
        
    @Mutation(() => CRMProduct_)
    async CreateCRMProduct(
        @Arg('input', () => CreateCRMProductInput) input: CreateCRMProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMProduct_)
    async UpdateCRMProduct(
        @Arg('input', () => UpdateCRMProductInput) input: UpdateCRMProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMProduct_)
    async DeleteCRMProduct(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Products', key, options, provider, userPayload, pubSub);
    }
    
}