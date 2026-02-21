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


import { AccreditingBodyEntity, AdvocacyActionEntity, BoardMemberEntity, BoardPositionEntity, CampaignMemberEntity, CampaignEntity, CertificateEntity, CertificationRenewalEntity, CertificationRequirementEntity, CertificationTypeEntity, CertificationEntity, ChapterMembershipEntity, ChapterOfficerEntity, ChapterEntity, CommitteeMembershipEntity, CommitteeEntity, CompetitionEntryEntity, CompetitionJudgeEntity, CompetitionEntity, ContinuingEducationEntity, CourseEntity, EmailClickEntity, EmailSendEntity, EmailTemplateEntity, EnrollmentEntity, EventRegistrationEntity, EventSessionEntity, EventEntity, flyway_schema_historyEntity, ForumCategoryEntity, ForumModerationEntity, ForumPostEntity, ForumThreadEntity, GovernmentContactEntity, InvoiceLineItemEntity, InvoiceEntity, LegislativeBodyEntity, LegislativeIssueEntity, MemberFollowEntity, MemberEntity, MembershipTypeEntity, MembershipEntity, OrganizationEntity, PaymentEntity, PolicyPositionEntity, PostAttachmentEntity, PostReactionEntity, PostTagEntity, ProductAwardEntity, ProductCategoryEntity, ProductEntity, RegulatoryCommentEntity, ResourceCategoryEntity, ResourceDownloadEntity, ResourceRatingEntity, ResourceTagEntity, ResourceVersionEntity, ResourceEntity, SegmentEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Accrediting Bodies
//****************************************************************************
@ObjectType()
export class AssociationDemoAccreditingBody_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Abbreviation?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ContactEmail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ContactPhone?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsRecognized?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    EstablishedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field(() => Int, {nullable: true}) 
    CertificationCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCertificationType_])
    CertificationTypes_AccreditingBodyIDArray: AssociationDemoCertificationType_[]; // Link to CertificationTypes
    
}

//****************************************************************************
// INPUT TYPE for Accrediting Bodies
//****************************************************************************
@InputType()
export class CreateAssociationDemoAccreditingBodyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Abbreviation: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    ContactEmail: string | null;

    @Field({ nullable: true })
    ContactPhone: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsRecognized?: boolean | null;

    @Field({ nullable: true })
    EstablishedDate: Date | null;

    @Field({ nullable: true })
    Country: string | null;

    @Field(() => Int, { nullable: true })
    CertificationCount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Accrediting Bodies
//****************************************************************************
@InputType()
export class UpdateAssociationDemoAccreditingBodyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Abbreviation?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    ContactEmail?: string | null;

    @Field({ nullable: true })
    ContactPhone?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsRecognized?: boolean | null;

    @Field({ nullable: true })
    EstablishedDate?: Date | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => Int, { nullable: true })
    CertificationCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Accrediting Bodies
//****************************************************************************
@ObjectType()
export class RunAssociationDemoAccreditingBodyViewResult {
    @Field(() => [AssociationDemoAccreditingBody_])
    Results: AssociationDemoAccreditingBody_[];

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

@Resolver(AssociationDemoAccreditingBody_)
export class AssociationDemoAccreditingBodyResolver extends ResolverBase {
    @Query(() => RunAssociationDemoAccreditingBodyViewResult)
    async RunAssociationDemoAccreditingBodyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoAccreditingBodyViewResult)
    async RunAssociationDemoAccreditingBodyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoAccreditingBodyViewResult)
    async RunAssociationDemoAccreditingBodyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Accrediting Bodies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoAccreditingBody_, { nullable: true })
    async AssociationDemoAccreditingBody(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoAccreditingBody_ | null> {
        this.CheckUserReadPermissions('Accrediting Bodies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwAccreditingBodies] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Accrediting Bodies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Accrediting Bodies', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificationType_])
    async CertificationTypes_AccreditingBodyIDArray(@Root() associationdemoaccreditingbody_: AssociationDemoAccreditingBody_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificationTypes] WHERE [AccreditingBodyID]='${associationdemoaccreditingbody_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certification Types', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoAccreditingBody_)
    async CreateAssociationDemoAccreditingBody(
        @Arg('input', () => CreateAssociationDemoAccreditingBodyInput) input: CreateAssociationDemoAccreditingBodyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Accrediting Bodies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoAccreditingBody_)
    async UpdateAssociationDemoAccreditingBody(
        @Arg('input', () => UpdateAssociationDemoAccreditingBodyInput) input: UpdateAssociationDemoAccreditingBodyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Accrediting Bodies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoAccreditingBody_)
    async DeleteAssociationDemoAccreditingBody(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Accrediting Bodies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Advocacy Actions
//****************************************************************************
@ObjectType()
export class AssociationDemoAdvocacyAction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    LegislativeIssueID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    MemberID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    GovernmentContactID?: string;
        
    @Field() 
    @MaxLength(100)
    ActionType: string;
        
    @Field() 
    @MaxLength(3)
    ActionDate: Date;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    Outcome?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    FollowUpRequired?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    FollowUpDate?: Date;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Advocacy Actions
//****************************************************************************
@InputType()
export class CreateAssociationDemoAdvocacyActionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    LegislativeIssueID?: string;

    @Field({ nullable: true })
    MemberID: string | null;

    @Field({ nullable: true })
    GovernmentContactID: string | null;

    @Field({ nullable: true })
    ActionType?: string;

    @Field({ nullable: true })
    ActionDate?: Date;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Outcome: string | null;

    @Field(() => Boolean, { nullable: true })
    FollowUpRequired?: boolean | null;

    @Field({ nullable: true })
    FollowUpDate: Date | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Advocacy Actions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoAdvocacyActionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    LegislativeIssueID?: string;

    @Field({ nullable: true })
    MemberID?: string | null;

    @Field({ nullable: true })
    GovernmentContactID?: string | null;

    @Field({ nullable: true })
    ActionType?: string;

    @Field({ nullable: true })
    ActionDate?: Date;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Outcome?: string | null;

    @Field(() => Boolean, { nullable: true })
    FollowUpRequired?: boolean | null;

    @Field({ nullable: true })
    FollowUpDate?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Advocacy Actions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoAdvocacyActionViewResult {
    @Field(() => [AssociationDemoAdvocacyAction_])
    Results: AssociationDemoAdvocacyAction_[];

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

@Resolver(AssociationDemoAdvocacyAction_)
export class AssociationDemoAdvocacyActionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoAdvocacyActionViewResult)
    async RunAssociationDemoAdvocacyActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoAdvocacyActionViewResult)
    async RunAssociationDemoAdvocacyActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoAdvocacyActionViewResult)
    async RunAssociationDemoAdvocacyActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Advocacy Actions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoAdvocacyAction_, { nullable: true })
    async AssociationDemoAdvocacyAction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoAdvocacyAction_ | null> {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwAdvocacyActions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Advocacy Actions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoAdvocacyAction_)
    async CreateAssociationDemoAdvocacyAction(
        @Arg('input', () => CreateAssociationDemoAdvocacyActionInput) input: CreateAssociationDemoAdvocacyActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Advocacy Actions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoAdvocacyAction_)
    async UpdateAssociationDemoAdvocacyAction(
        @Arg('input', () => UpdateAssociationDemoAdvocacyActionInput) input: UpdateAssociationDemoAdvocacyActionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Advocacy Actions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoAdvocacyAction_)
    async DeleteAssociationDemoAdvocacyAction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Advocacy Actions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Board Members
//****************************************************************************
@ObjectType({ description: `Current and historical board members` })
export class AssociationDemoBoardMember_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Board position held`}) 
    @MaxLength(16)
    BoardPositionID: string;
        
    @Field({description: `Member serving on board`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Start date of board service`}) 
    @MaxLength(3)
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of board service`}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Date member was elected to this position`}) 
    @MaxLength(3)
    ElectionDate?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Board Members
//****************************************************************************
@InputType()
export class CreateAssociationDemoBoardMemberInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BoardPositionID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    ElectionDate: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Board Members
//****************************************************************************
@InputType()
export class UpdateAssociationDemoBoardMemberInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BoardPositionID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    ElectionDate?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Board Members
//****************************************************************************
@ObjectType()
export class RunAssociationDemoBoardMemberViewResult {
    @Field(() => [AssociationDemoBoardMember_])
    Results: AssociationDemoBoardMember_[];

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

@Resolver(AssociationDemoBoardMember_)
export class AssociationDemoBoardMemberResolver extends ResolverBase {
    @Query(() => RunAssociationDemoBoardMemberViewResult)
    async RunAssociationDemoBoardMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoBoardMemberViewResult)
    async RunAssociationDemoBoardMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoBoardMemberViewResult)
    async RunAssociationDemoBoardMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Board Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoBoardMember_, { nullable: true })
    async AssociationDemoBoardMember(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoBoardMember_ | null> {
        this.CheckUserReadPermissions('Board Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwBoardMembers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Board Members', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoBoardMember_)
    async CreateAssociationDemoBoardMember(
        @Arg('input', () => CreateAssociationDemoBoardMemberInput) input: CreateAssociationDemoBoardMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Board Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoBoardMember_)
    async UpdateAssociationDemoBoardMember(
        @Arg('input', () => UpdateAssociationDemoBoardMemberInput) input: UpdateAssociationDemoBoardMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Board Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoBoardMember_)
    async DeleteAssociationDemoBoardMember(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Board Members', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Board Positions
//****************************************************************************
@ObjectType({ description: `Board of directors positions` })
export class AssociationDemoBoardPosition_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Position title (President, Vice President, Treasurer, etc.)`}) 
    @MaxLength(200)
    PositionTitle: string;
        
    @Field(() => Int, {description: `Display order for listing positions`}) 
    PositionOrder: number;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Int, {nullable: true, description: `Length of term in years`}) 
    TermLengthYears?: number;
        
    @Field(() => Boolean, {description: `Whether this is an officer position`}) 
    IsOfficer: boolean;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoBoardMember_])
    BoardMembers_BoardPositionIDArray: AssociationDemoBoardMember_[]; // Link to BoardMembers
    
}

//****************************************************************************
// INPUT TYPE for Board Positions
//****************************************************************************
@InputType()
export class CreateAssociationDemoBoardPositionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PositionTitle?: string;

    @Field(() => Int, { nullable: true })
    PositionOrder?: number;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    TermLengthYears: number | null;

    @Field(() => Boolean, { nullable: true })
    IsOfficer?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Board Positions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoBoardPositionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PositionTitle?: string;

    @Field(() => Int, { nullable: true })
    PositionOrder?: number;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    TermLengthYears?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsOfficer?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Board Positions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoBoardPositionViewResult {
    @Field(() => [AssociationDemoBoardPosition_])
    Results: AssociationDemoBoardPosition_[];

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

@Resolver(AssociationDemoBoardPosition_)
export class AssociationDemoBoardPositionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoBoardPositionViewResult)
    async RunAssociationDemoBoardPositionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoBoardPositionViewResult)
    async RunAssociationDemoBoardPositionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoBoardPositionViewResult)
    async RunAssociationDemoBoardPositionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Board Positions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoBoardPosition_, { nullable: true })
    async AssociationDemoBoardPosition(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoBoardPosition_ | null> {
        this.CheckUserReadPermissions('Board Positions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwBoardPositions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Positions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Board Positions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoBoardMember_])
    async BoardMembers_BoardPositionIDArray(@Root() associationdemoboardposition_: AssociationDemoBoardPosition_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Board Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwBoardMembers] WHERE [BoardPositionID]='${associationdemoboardposition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Board Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoBoardPosition_)
    async CreateAssociationDemoBoardPosition(
        @Arg('input', () => CreateAssociationDemoBoardPositionInput) input: CreateAssociationDemoBoardPositionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Board Positions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoBoardPosition_)
    async UpdateAssociationDemoBoardPosition(
        @Arg('input', () => UpdateAssociationDemoBoardPositionInput) input: UpdateAssociationDemoBoardPositionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Board Positions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoBoardPosition_)
    async DeleteAssociationDemoBoardPosition(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Board Positions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Campaign Members
//****************************************************************************
@ObjectType({ description: `Members targeted by marketing campaigns` })
export class AssociationDemoCampaignMember_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Campaign targeting this member`}) 
    @MaxLength(16)
    CampaignID: string;
        
    @Field({description: `Member being targeted`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({nullable: true, description: `Segment this member was added through`}) 
    @MaxLength(16)
    SegmentID?: string;
        
    @Field({description: `Date member was added to campaign`}) 
    @MaxLength(8)
    AddedDate: Date;
        
    @Field({description: `Campaign member status: Targeted, Sent, Responded, Converted, or Opted Out`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ResponseDate?: Date;
        
    @Field(() => Float, {nullable: true, description: `Value of conversion (revenue generated from this campaign interaction)`}) 
    ConversionValue?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Campaign: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Segment?: string;
        
}

//****************************************************************************
// INPUT TYPE for Campaign Members
//****************************************************************************
@InputType()
export class CreateAssociationDemoCampaignMemberInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CampaignID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    SegmentID: string | null;

    @Field({ nullable: true })
    AddedDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ResponseDate: Date | null;

    @Field(() => Float, { nullable: true })
    ConversionValue: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Campaign Members
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCampaignMemberInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CampaignID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    SegmentID?: string | null;

    @Field({ nullable: true })
    AddedDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ResponseDate?: Date | null;

    @Field(() => Float, { nullable: true })
    ConversionValue?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Campaign Members
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCampaignMemberViewResult {
    @Field(() => [AssociationDemoCampaignMember_])
    Results: AssociationDemoCampaignMember_[];

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

@Resolver(AssociationDemoCampaignMember_)
export class AssociationDemoCampaignMemberResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCampaignMemberViewResult)
    async RunAssociationDemoCampaignMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCampaignMemberViewResult)
    async RunAssociationDemoCampaignMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCampaignMemberViewResult)
    async RunAssociationDemoCampaignMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Campaign Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCampaignMember_, { nullable: true })
    async AssociationDemoCampaignMember(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCampaignMember_ | null> {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCampaignMembers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaign Members', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoCampaignMember_)
    async CreateAssociationDemoCampaignMember(
        @Arg('input', () => CreateAssociationDemoCampaignMemberInput) input: CreateAssociationDemoCampaignMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Campaign Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCampaignMember_)
    async UpdateAssociationDemoCampaignMember(
        @Arg('input', () => UpdateAssociationDemoCampaignMemberInput) input: UpdateAssociationDemoCampaignMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Campaign Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCampaignMember_)
    async DeleteAssociationDemoCampaignMember(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Campaign Members', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Campaigns
//****************************************************************************
@ObjectType({ description: `Marketing campaigns and promotional initiatives` })
export class AssociationDemoCampaign_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Campaign name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({description: `Campaign type: Email, Event Promotion, Membership Renewal, Course Launch, Donation Drive, or Member Engagement`}) 
    @MaxLength(100)
    CampaignType: string;
        
    @Field({description: `Campaign status: Draft, Scheduled, Active, Completed, or Cancelled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `Campaign start date`}) 
    @MaxLength(3)
    StartDate?: Date;
        
    @Field({nullable: true, description: `Campaign end date`}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field(() => Float, {nullable: true, description: `Budgeted amount for campaign`}) 
    Budget?: number;
        
    @Field(() => Float, {nullable: true, description: `Actual cost incurred`}) 
    ActualCost?: number;
        
    @Field({nullable: true}) 
    TargetAudience?: string;
        
    @Field({nullable: true}) 
    Goals?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCampaignMember_])
    CampaignMembers_CampaignIDArray: AssociationDemoCampaignMember_[]; // Link to CampaignMembers
    
    @Field(() => [AssociationDemoEmailSend_])
    EmailSends_CampaignIDArray: AssociationDemoEmailSend_[]; // Link to EmailSends
    
}

//****************************************************************************
// INPUT TYPE for Campaigns
//****************************************************************************
@InputType()
export class CreateAssociationDemoCampaignInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    CampaignType?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Float, { nullable: true })
    Budget: number | null;

    @Field(() => Float, { nullable: true })
    ActualCost: number | null;

    @Field({ nullable: true })
    TargetAudience: string | null;

    @Field({ nullable: true })
    Goals: string | null;

    @Field({ nullable: true })
    Description: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Campaigns
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCampaignInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    CampaignType?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Float, { nullable: true })
    Budget?: number | null;

    @Field(() => Float, { nullable: true })
    ActualCost?: number | null;

    @Field({ nullable: true })
    TargetAudience?: string | null;

    @Field({ nullable: true })
    Goals?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Campaigns
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCampaignViewResult {
    @Field(() => [AssociationDemoCampaign_])
    Results: AssociationDemoCampaign_[];

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

@Resolver(AssociationDemoCampaign_)
export class AssociationDemoCampaignResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCampaignViewResult)
    async RunAssociationDemoCampaignViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCampaignViewResult)
    async RunAssociationDemoCampaignViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCampaignViewResult)
    async RunAssociationDemoCampaignDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Campaigns';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCampaign_, { nullable: true })
    async AssociationDemoCampaign(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCampaign_ | null> {
        this.CheckUserReadPermissions('Campaigns', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCampaigns] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaigns', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaigns', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCampaignMember_])
    async CampaignMembers_CampaignIDArray(@Root() associationdemocampaign_: AssociationDemoCampaign_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCampaignMembers] WHERE [CampaignID]='${associationdemocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Campaign Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEmailSend_])
    async EmailSends_CampaignIDArray(@Root() associationdemocampaign_: AssociationDemoCampaign_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailSends] WHERE [CampaignID]='${associationdemocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Sends', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCampaign_)
    async CreateAssociationDemoCampaign(
        @Arg('input', () => CreateAssociationDemoCampaignInput) input: CreateAssociationDemoCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Campaigns', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCampaign_)
    async UpdateAssociationDemoCampaign(
        @Arg('input', () => UpdateAssociationDemoCampaignInput) input: UpdateAssociationDemoCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Campaigns', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCampaign_)
    async DeleteAssociationDemoCampaign(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Campaigns', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certificates
//****************************************************************************
@ObjectType({ description: `Completion certificates issued to members` })
export class AssociationDemoCertificate_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Course enrollment this certificate is for`}) 
    @MaxLength(16)
    EnrollmentID: string;
        
    @Field({description: `Unique certificate number`}) 
    @MaxLength(100)
    CertificateNumber: string;
        
    @Field({description: `Date certificate was issued`}) 
    @MaxLength(3)
    IssuedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    ExpirationDate?: Date;
        
    @Field({nullable: true, description: `URL to downloadable PDF certificate`}) 
    @MaxLength(1000)
    CertificatePDFURL?: string;
        
    @Field({nullable: true, description: `Unique verification code for authenticity checking`}) 
    @MaxLength(200)
    VerificationCode?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Certificates
//****************************************************************************
@InputType()
export class CreateAssociationDemoCertificateInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EnrollmentID?: string;

    @Field({ nullable: true })
    CertificateNumber?: string;

    @Field({ nullable: true })
    IssuedDate?: Date;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    CertificatePDFURL: string | null;

    @Field({ nullable: true })
    VerificationCode: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Certificates
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCertificateInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EnrollmentID?: string;

    @Field({ nullable: true })
    CertificateNumber?: string;

    @Field({ nullable: true })
    IssuedDate?: Date;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    CertificatePDFURL?: string | null;

    @Field({ nullable: true })
    VerificationCode?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certificates
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCertificateViewResult {
    @Field(() => [AssociationDemoCertificate_])
    Results: AssociationDemoCertificate_[];

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

@Resolver(AssociationDemoCertificate_)
export class AssociationDemoCertificateResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCertificateViewResult)
    async RunAssociationDemoCertificateViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificateViewResult)
    async RunAssociationDemoCertificateViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificateViewResult)
    async RunAssociationDemoCertificateDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certificates';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCertificate_, { nullable: true })
    async AssociationDemoCertificate(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificate_ | null> {
        this.CheckUserReadPermissions('Certificates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificates] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certificates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certificates', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoCertificate_)
    async CreateAssociationDemoCertificate(
        @Arg('input', () => CreateAssociationDemoCertificateInput) input: CreateAssociationDemoCertificateInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certificates', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCertificate_)
    async UpdateAssociationDemoCertificate(
        @Arg('input', () => UpdateAssociationDemoCertificateInput) input: UpdateAssociationDemoCertificateInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certificates', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCertificate_)
    async DeleteAssociationDemoCertificate(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Certificates', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certification Renewals
//****************************************************************************
@ObjectType()
export class AssociationDemoCertificationRenewal_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    CertificationID: string;
        
    @Field() 
    @MaxLength(3)
    RenewalDate: Date;
        
    @Field() 
    @MaxLength(3)
    ExpirationDate: Date;
        
    @Field(() => Int, {nullable: true}) 
    CECreditsApplied?: number;
        
    @Field(() => Float, {nullable: true}) 
    FeePaid?: number;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    PaymentDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ProcessedBy?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    ProcessedDate?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Certification Renewals
//****************************************************************************
@InputType()
export class CreateAssociationDemoCertificationRenewalInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CertificationID?: string;

    @Field({ nullable: true })
    RenewalDate?: Date;

    @Field({ nullable: true })
    ExpirationDate?: Date;

    @Field(() => Int, { nullable: true })
    CECreditsApplied?: number | null;

    @Field(() => Float, { nullable: true })
    FeePaid: number | null;

    @Field({ nullable: true })
    PaymentDate: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    ProcessedBy: string | null;

    @Field({ nullable: true })
    ProcessedDate: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Certification Renewals
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCertificationRenewalInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CertificationID?: string;

    @Field({ nullable: true })
    RenewalDate?: Date;

    @Field({ nullable: true })
    ExpirationDate?: Date;

    @Field(() => Int, { nullable: true })
    CECreditsApplied?: number | null;

    @Field(() => Float, { nullable: true })
    FeePaid?: number | null;

    @Field({ nullable: true })
    PaymentDate?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    ProcessedBy?: string | null;

    @Field({ nullable: true })
    ProcessedDate?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certification Renewals
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCertificationRenewalViewResult {
    @Field(() => [AssociationDemoCertificationRenewal_])
    Results: AssociationDemoCertificationRenewal_[];

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

@Resolver(AssociationDemoCertificationRenewal_)
export class AssociationDemoCertificationRenewalResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCertificationRenewalViewResult)
    async RunAssociationDemoCertificationRenewalViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationRenewalViewResult)
    async RunAssociationDemoCertificationRenewalViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationRenewalViewResult)
    async RunAssociationDemoCertificationRenewalDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certification Renewals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCertificationRenewal_, { nullable: true })
    async AssociationDemoCertificationRenewal(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificationRenewal_ | null> {
        this.CheckUserReadPermissions('Certification Renewals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificationRenewals] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Renewals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Renewals', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoCertificationRenewal_)
    async CreateAssociationDemoCertificationRenewal(
        @Arg('input', () => CreateAssociationDemoCertificationRenewalInput) input: CreateAssociationDemoCertificationRenewalInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certification Renewals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCertificationRenewal_)
    async UpdateAssociationDemoCertificationRenewal(
        @Arg('input', () => UpdateAssociationDemoCertificationRenewalInput) input: UpdateAssociationDemoCertificationRenewalInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certification Renewals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCertificationRenewal_)
    async DeleteAssociationDemoCertificationRenewal(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Certification Renewals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certification Requirements
//****************************************************************************
@ObjectType()
export class AssociationDemoCertificationRequirement_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    CertificationTypeID: string;
        
    @Field() 
    @MaxLength(200)
    RequirementType: string;
        
    @Field() 
    Description: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsRequired?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field({nullable: true}) 
    Details?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    CertificationType: string;
        
}

//****************************************************************************
// INPUT TYPE for Certification Requirements
//****************************************************************************
@InputType()
export class CreateAssociationDemoCertificationRequirementInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CertificationTypeID?: string;

    @Field({ nullable: true })
    RequirementType?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Boolean, { nullable: true })
    IsRequired?: boolean | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field({ nullable: true })
    Details: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Certification Requirements
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCertificationRequirementInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CertificationTypeID?: string;

    @Field({ nullable: true })
    RequirementType?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Boolean, { nullable: true })
    IsRequired?: boolean | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field({ nullable: true })
    Details?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certification Requirements
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCertificationRequirementViewResult {
    @Field(() => [AssociationDemoCertificationRequirement_])
    Results: AssociationDemoCertificationRequirement_[];

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

@Resolver(AssociationDemoCertificationRequirement_)
export class AssociationDemoCertificationRequirementResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCertificationRequirementViewResult)
    async RunAssociationDemoCertificationRequirementViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationRequirementViewResult)
    async RunAssociationDemoCertificationRequirementViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationRequirementViewResult)
    async RunAssociationDemoCertificationRequirementDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certification Requirements';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCertificationRequirement_, { nullable: true })
    async AssociationDemoCertificationRequirement(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificationRequirement_ | null> {
        this.CheckUserReadPermissions('Certification Requirements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificationRequirements] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Requirements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Requirements', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoCertificationRequirement_)
    async CreateAssociationDemoCertificationRequirement(
        @Arg('input', () => CreateAssociationDemoCertificationRequirementInput) input: CreateAssociationDemoCertificationRequirementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certification Requirements', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCertificationRequirement_)
    async UpdateAssociationDemoCertificationRequirement(
        @Arg('input', () => UpdateAssociationDemoCertificationRequirementInput) input: UpdateAssociationDemoCertificationRequirementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certification Requirements', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCertificationRequirement_)
    async DeleteAssociationDemoCertificationRequirement(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Certification Requirements', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certification Types
//****************************************************************************
@ObjectType()
export class AssociationDemoCertificationType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    AccreditingBodyID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Abbreviation?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Level?: string;
        
    @Field(() => Int, {nullable: true}) 
    DurationMonths?: number;
        
    @Field(() => Int, {nullable: true}) 
    RenewalRequiredMonths?: number;
        
    @Field(() => Int, {nullable: true}) 
    CECreditsRequired?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    ExamRequired?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    PracticalRequired?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    CostUSD?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field({nullable: true}) 
    Prerequisites?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    TargetAudience?: string;
        
    @Field(() => Int, {nullable: true}) 
    CertificationCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    AccreditingBody: string;
        
    @Field(() => [AssociationDemoCertificationRequirement_])
    CertificationRequirements_CertificationTypeIDArray: AssociationDemoCertificationRequirement_[]; // Link to CertificationRequirements
    
    @Field(() => [AssociationDemoCertification_])
    Certifications_CertificationTypeIDArray: AssociationDemoCertification_[]; // Link to Certifications
    
}

//****************************************************************************
// INPUT TYPE for Certification Types
//****************************************************************************
@InputType()
export class CreateAssociationDemoCertificationTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    AccreditingBodyID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Abbreviation: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Level: string | null;

    @Field(() => Int, { nullable: true })
    DurationMonths: number | null;

    @Field(() => Int, { nullable: true })
    RenewalRequiredMonths: number | null;

    @Field(() => Int, { nullable: true })
    CECreditsRequired?: number | null;

    @Field(() => Boolean, { nullable: true })
    ExamRequired?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    PracticalRequired?: boolean | null;

    @Field(() => Float, { nullable: true })
    CostUSD: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field({ nullable: true })
    Prerequisites: string | null;

    @Field({ nullable: true })
    TargetAudience: string | null;

    @Field(() => Int, { nullable: true })
    CertificationCount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Certification Types
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCertificationTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    AccreditingBodyID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Abbreviation?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Level?: string | null;

    @Field(() => Int, { nullable: true })
    DurationMonths?: number | null;

    @Field(() => Int, { nullable: true })
    RenewalRequiredMonths?: number | null;

    @Field(() => Int, { nullable: true })
    CECreditsRequired?: number | null;

    @Field(() => Boolean, { nullable: true })
    ExamRequired?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    PracticalRequired?: boolean | null;

    @Field(() => Float, { nullable: true })
    CostUSD?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field({ nullable: true })
    Prerequisites?: string | null;

    @Field({ nullable: true })
    TargetAudience?: string | null;

    @Field(() => Int, { nullable: true })
    CertificationCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certification Types
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCertificationTypeViewResult {
    @Field(() => [AssociationDemoCertificationType_])
    Results: AssociationDemoCertificationType_[];

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

@Resolver(AssociationDemoCertificationType_)
export class AssociationDemoCertificationTypeResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCertificationTypeViewResult)
    async RunAssociationDemoCertificationTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationTypeViewResult)
    async RunAssociationDemoCertificationTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationTypeViewResult)
    async RunAssociationDemoCertificationTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certification Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCertificationType_, { nullable: true })
    async AssociationDemoCertificationType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificationType_ | null> {
        this.CheckUserReadPermissions('Certification Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificationTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Types', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificationRequirement_])
    async CertificationRequirements_CertificationTypeIDArray(@Root() associationdemocertificationtype_: AssociationDemoCertificationType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Requirements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificationRequirements] WHERE [CertificationTypeID]='${associationdemocertificationtype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Requirements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certification Requirements', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCertification_])
    async Certifications_CertificationTypeIDArray(@Root() associationdemocertificationtype_: AssociationDemoCertificationType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertifications] WHERE [CertificationTypeID]='${associationdemocertificationtype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certifications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCertificationType_)
    async CreateAssociationDemoCertificationType(
        @Arg('input', () => CreateAssociationDemoCertificationTypeInput) input: CreateAssociationDemoCertificationTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certification Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCertificationType_)
    async UpdateAssociationDemoCertificationType(
        @Arg('input', () => UpdateAssociationDemoCertificationTypeInput) input: UpdateAssociationDemoCertificationTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certification Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCertificationType_)
    async DeleteAssociationDemoCertificationType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Certification Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Certifications
//****************************************************************************
@ObjectType()
export class AssociationDemoCertification_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(16)
    CertificationTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CertificationNumber?: string;
        
    @Field() 
    @MaxLength(3)
    DateEarned: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    DateExpires?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field(() => Int, {nullable: true}) 
    Score?: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    VerificationURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    IssuedBy?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    LastRenewalDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    NextRenewalDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    CECreditsEarned?: number;
        
    @Field(() => Int, {nullable: true}) 
    RenewalCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    CertificationType: string;
        
    @Field(() => [AssociationDemoCertificationRenewal_])
    CertificationRenewals_CertificationIDArray: AssociationDemoCertificationRenewal_[]; // Link to CertificationRenewals
    
    @Field(() => [AssociationDemoContinuingEducation_])
    ContinuingEducations_CertificationIDArray: AssociationDemoContinuingEducation_[]; // Link to ContinuingEducations
    
}

//****************************************************************************
// INPUT TYPE for Certifications
//****************************************************************************
@InputType()
export class CreateAssociationDemoCertificationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    CertificationTypeID?: string;

    @Field({ nullable: true })
    CertificationNumber: string | null;

    @Field({ nullable: true })
    DateEarned?: Date;

    @Field({ nullable: true })
    DateExpires: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Int, { nullable: true })
    Score: number | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    VerificationURL: string | null;

    @Field({ nullable: true })
    IssuedBy: string | null;

    @Field({ nullable: true })
    LastRenewalDate: Date | null;

    @Field({ nullable: true })
    NextRenewalDate: Date | null;

    @Field(() => Int, { nullable: true })
    CECreditsEarned?: number | null;

    @Field(() => Int, { nullable: true })
    RenewalCount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Certifications
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCertificationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    CertificationTypeID?: string;

    @Field({ nullable: true })
    CertificationNumber?: string | null;

    @Field({ nullable: true })
    DateEarned?: Date;

    @Field({ nullable: true })
    DateExpires?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Int, { nullable: true })
    Score?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    VerificationURL?: string | null;

    @Field({ nullable: true })
    IssuedBy?: string | null;

    @Field({ nullable: true })
    LastRenewalDate?: Date | null;

    @Field({ nullable: true })
    NextRenewalDate?: Date | null;

    @Field(() => Int, { nullable: true })
    CECreditsEarned?: number | null;

    @Field(() => Int, { nullable: true })
    RenewalCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Certifications
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCertificationViewResult {
    @Field(() => [AssociationDemoCertification_])
    Results: AssociationDemoCertification_[];

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

@Resolver(AssociationDemoCertification_)
export class AssociationDemoCertificationResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCertificationViewResult)
    async RunAssociationDemoCertificationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationViewResult)
    async RunAssociationDemoCertificationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCertificationViewResult)
    async RunAssociationDemoCertificationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Certifications';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCertification_, { nullable: true })
    async AssociationDemoCertification(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertification_ | null> {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertifications] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certifications', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificationRenewal_])
    async CertificationRenewals_CertificationIDArray(@Root() associationdemocertification_: AssociationDemoCertification_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Renewals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificationRenewals] WHERE [CertificationID]='${associationdemocertification_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Renewals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certification Renewals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoContinuingEducation_])
    async ContinuingEducations_CertificationIDArray(@Root() associationdemocertification_: AssociationDemoCertification_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Continuing Educations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwContinuingEducations] WHERE [CertificationID]='${associationdemocertification_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Continuing Educations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Continuing Educations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCertification_)
    async CreateAssociationDemoCertification(
        @Arg('input', () => CreateAssociationDemoCertificationInput) input: CreateAssociationDemoCertificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Certifications', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCertification_)
    async UpdateAssociationDemoCertification(
        @Arg('input', () => UpdateAssociationDemoCertificationInput) input: UpdateAssociationDemoCertificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Certifications', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCertification_)
    async DeleteAssociationDemoCertification(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Certifications', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Chapter Memberships
//****************************************************************************
@ObjectType({ description: `Member participation in local chapters` })
export class AssociationDemoChapterMembership_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Chapter this membership is for`}) 
    @MaxLength(16)
    ChapterID: string;
        
    @Field({description: `Member participating in chapter`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Date member joined the chapter`}) 
    @MaxLength(3)
    JoinDate: Date;
        
    @Field({description: `Membership status: Active or Inactive`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `Role within chapter (Member, Officer, etc.)`}) 
    @MaxLength(200)
    Role?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Chapter: string;
        
}

//****************************************************************************
// INPUT TYPE for Chapter Memberships
//****************************************************************************
@InputType()
export class CreateAssociationDemoChapterMembershipInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChapterID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Role: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Chapter Memberships
//****************************************************************************
@InputType()
export class UpdateAssociationDemoChapterMembershipInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChapterID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Role?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Chapter Memberships
//****************************************************************************
@ObjectType()
export class RunAssociationDemoChapterMembershipViewResult {
    @Field(() => [AssociationDemoChapterMembership_])
    Results: AssociationDemoChapterMembership_[];

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

@Resolver(AssociationDemoChapterMembership_)
export class AssociationDemoChapterMembershipResolver extends ResolverBase {
    @Query(() => RunAssociationDemoChapterMembershipViewResult)
    async RunAssociationDemoChapterMembershipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoChapterMembershipViewResult)
    async RunAssociationDemoChapterMembershipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoChapterMembershipViewResult)
    async RunAssociationDemoChapterMembershipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Chapter Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoChapterMembership_, { nullable: true })
    async AssociationDemoChapterMembership(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoChapterMembership_ | null> {
        this.CheckUserReadPermissions('Chapter Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapterMemberships] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Chapter Memberships', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoChapterMembership_)
    async CreateAssociationDemoChapterMembership(
        @Arg('input', () => CreateAssociationDemoChapterMembershipInput) input: CreateAssociationDemoChapterMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Chapter Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoChapterMembership_)
    async UpdateAssociationDemoChapterMembership(
        @Arg('input', () => UpdateAssociationDemoChapterMembershipInput) input: UpdateAssociationDemoChapterMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Chapter Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoChapterMembership_)
    async DeleteAssociationDemoChapterMembership(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Chapter Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Chapter Officers
//****************************************************************************
@ObjectType({ description: `Chapter leadership positions and officers` })
export class AssociationDemoChapterOfficer_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Chapter this officer serves`}) 
    @MaxLength(16)
    ChapterID: string;
        
    @Field({description: `Member serving as officer`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Officer position (President, Vice President, Secretary, etc.)`}) 
    @MaxLength(200)
    Position: string;
        
    @Field({description: `Start date of officer term`}) 
    @MaxLength(3)
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of officer term`}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Chapter: string;
        
}

//****************************************************************************
// INPUT TYPE for Chapter Officers
//****************************************************************************
@InputType()
export class CreateAssociationDemoChapterOfficerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChapterID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    Position?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Chapter Officers
//****************************************************************************
@InputType()
export class UpdateAssociationDemoChapterOfficerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChapterID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    Position?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Chapter Officers
//****************************************************************************
@ObjectType()
export class RunAssociationDemoChapterOfficerViewResult {
    @Field(() => [AssociationDemoChapterOfficer_])
    Results: AssociationDemoChapterOfficer_[];

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

@Resolver(AssociationDemoChapterOfficer_)
export class AssociationDemoChapterOfficerResolver extends ResolverBase {
    @Query(() => RunAssociationDemoChapterOfficerViewResult)
    async RunAssociationDemoChapterOfficerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoChapterOfficerViewResult)
    async RunAssociationDemoChapterOfficerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoChapterOfficerViewResult)
    async RunAssociationDemoChapterOfficerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Chapter Officers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoChapterOfficer_, { nullable: true })
    async AssociationDemoChapterOfficer(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoChapterOfficer_ | null> {
        this.CheckUserReadPermissions('Chapter Officers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapterOfficers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Officers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Chapter Officers', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoChapterOfficer_)
    async CreateAssociationDemoChapterOfficer(
        @Arg('input', () => CreateAssociationDemoChapterOfficerInput) input: CreateAssociationDemoChapterOfficerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Chapter Officers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoChapterOfficer_)
    async UpdateAssociationDemoChapterOfficer(
        @Arg('input', () => UpdateAssociationDemoChapterOfficerInput) input: UpdateAssociationDemoChapterOfficerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Chapter Officers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoChapterOfficer_)
    async DeleteAssociationDemoChapterOfficer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Chapter Officers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Chapters
//****************************************************************************
@ObjectType({ description: `Local chapters and special interest groups within the association` })
export class AssociationDemoChapter_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Chapter name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({description: `Chapter type: Geographic, Special Interest, or Industry`}) 
    @MaxLength(100)
    ChapterType: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Region?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true, description: `Date chapter was founded`}) 
    @MaxLength(3)
    FoundedDate?: Date;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Email?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `How often the chapter meets`}) 
    @MaxLength(200)
    MeetingFrequency?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of active members in this chapter`}) 
    MemberCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoChapterMembership_])
    ChapterMemberships_ChapterIDArray: AssociationDemoChapterMembership_[]; // Link to ChapterMemberships
    
    @Field(() => [AssociationDemoChapterOfficer_])
    ChapterOfficers_ChapterIDArray: AssociationDemoChapterOfficer_[]; // Link to ChapterOfficers
    
}

//****************************************************************************
// INPUT TYPE for Chapters
//****************************************************************************
@InputType()
export class CreateAssociationDemoChapterInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ChapterType?: string;

    @Field({ nullable: true })
    Region: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    FoundedDate: Date | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    MeetingFrequency: string | null;

    @Field(() => Int, { nullable: true })
    MemberCount: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Chapters
//****************************************************************************
@InputType()
export class UpdateAssociationDemoChapterInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ChapterType?: string;

    @Field({ nullable: true })
    Region?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    FoundedDate?: Date | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    MeetingFrequency?: string | null;

    @Field(() => Int, { nullable: true })
    MemberCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Chapters
//****************************************************************************
@ObjectType()
export class RunAssociationDemoChapterViewResult {
    @Field(() => [AssociationDemoChapter_])
    Results: AssociationDemoChapter_[];

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

@Resolver(AssociationDemoChapter_)
export class AssociationDemoChapterResolver extends ResolverBase {
    @Query(() => RunAssociationDemoChapterViewResult)
    async RunAssociationDemoChapterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoChapterViewResult)
    async RunAssociationDemoChapterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoChapterViewResult)
    async RunAssociationDemoChapterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Chapters';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoChapter_, { nullable: true })
    async AssociationDemoChapter(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoChapter_ | null> {
        this.CheckUserReadPermissions('Chapters', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapters] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapters', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Chapters', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoChapterMembership_])
    async ChapterMemberships_ChapterIDArray(@Root() associationdemochapter_: AssociationDemoChapter_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapterMemberships] WHERE [ChapterID]='${associationdemochapter_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoChapterOfficer_])
    async ChapterOfficers_ChapterIDArray(@Root() associationdemochapter_: AssociationDemoChapter_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Officers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapterOfficers] WHERE [ChapterID]='${associationdemochapter_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Officers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Officers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoChapter_)
    async CreateAssociationDemoChapter(
        @Arg('input', () => CreateAssociationDemoChapterInput) input: CreateAssociationDemoChapterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Chapters', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoChapter_)
    async UpdateAssociationDemoChapter(
        @Arg('input', () => UpdateAssociationDemoChapterInput) input: UpdateAssociationDemoChapterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Chapters', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoChapter_)
    async DeleteAssociationDemoChapter(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Chapters', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Committee Memberships
//****************************************************************************
@ObjectType({ description: `Committee member assignments and roles` })
export class AssociationDemoCommitteeMembership_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Committee this membership is for`}) 
    @MaxLength(16)
    CommitteeID: string;
        
    @Field({description: `Member serving on committee`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Role on committee (Chair, Vice Chair, Member, etc.)`}) 
    @MaxLength(200)
    Role: string;
        
    @Field({description: `Start date of committee service`}) 
    @MaxLength(3)
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of committee service`}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Who appointed this member to the committee`}) 
    @MaxLength(510)
    AppointedBy?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Committee: string;
        
}

//****************************************************************************
// INPUT TYPE for Committee Memberships
//****************************************************************************
@InputType()
export class CreateAssociationDemoCommitteeMembershipInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    Role?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    AppointedBy: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Committee Memberships
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCommitteeMembershipInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CommitteeID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    Role?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    AppointedBy?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Committee Memberships
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCommitteeMembershipViewResult {
    @Field(() => [AssociationDemoCommitteeMembership_])
    Results: AssociationDemoCommitteeMembership_[];

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

@Resolver(AssociationDemoCommitteeMembership_)
export class AssociationDemoCommitteeMembershipResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCommitteeMembershipViewResult)
    async RunAssociationDemoCommitteeMembershipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCommitteeMembershipViewResult)
    async RunAssociationDemoCommitteeMembershipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCommitteeMembershipViewResult)
    async RunAssociationDemoCommitteeMembershipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Committee Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCommitteeMembership_, { nullable: true })
    async AssociationDemoCommitteeMembership(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCommitteeMembership_ | null> {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCommitteeMemberships] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Committee Memberships', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoCommitteeMembership_)
    async CreateAssociationDemoCommitteeMembership(
        @Arg('input', () => CreateAssociationDemoCommitteeMembershipInput) input: CreateAssociationDemoCommitteeMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Committee Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCommitteeMembership_)
    async UpdateAssociationDemoCommitteeMembership(
        @Arg('input', () => UpdateAssociationDemoCommitteeMembershipInput) input: UpdateAssociationDemoCommitteeMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Committee Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCommitteeMembership_)
    async DeleteAssociationDemoCommitteeMembership(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Committee Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Committees
//****************************************************************************
@ObjectType({ description: `Association committees and task forces` })
export class AssociationDemoCommittee_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Committee name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({description: `Committee type: Standing, Ad Hoc, or Task Force`}) 
    @MaxLength(100)
    CommitteeType: string;
        
    @Field({nullable: true, description: `Purpose and charter of the committee`}) 
    Purpose?: string;
        
    @Field({nullable: true, description: `How often committee meets`}) 
    @MaxLength(200)
    MeetingFrequency?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Date committee was formed`}) 
    @MaxLength(3)
    FormedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    DisbandedDate?: Date;
        
    @Field({nullable: true, description: `Member serving as committee chair`}) 
    @MaxLength(16)
    ChairMemberID?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum number of committee members allowed`}) 
    MaxMembers?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCommitteeMembership_])
    CommitteeMemberships_CommitteeIDArray: AssociationDemoCommitteeMembership_[]; // Link to CommitteeMemberships
    
}

//****************************************************************************
// INPUT TYPE for Committees
//****************************************************************************
@InputType()
export class CreateAssociationDemoCommitteeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    CommitteeType?: string;

    @Field({ nullable: true })
    Purpose: string | null;

    @Field({ nullable: true })
    MeetingFrequency: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    FormedDate: Date | null;

    @Field({ nullable: true })
    DisbandedDate: Date | null;

    @Field({ nullable: true })
    ChairMemberID: string | null;

    @Field(() => Int, { nullable: true })
    MaxMembers: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Committees
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCommitteeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    CommitteeType?: string;

    @Field({ nullable: true })
    Purpose?: string | null;

    @Field({ nullable: true })
    MeetingFrequency?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    FormedDate?: Date | null;

    @Field({ nullable: true })
    DisbandedDate?: Date | null;

    @Field({ nullable: true })
    ChairMemberID?: string | null;

    @Field(() => Int, { nullable: true })
    MaxMembers?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Committees
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCommitteeViewResult {
    @Field(() => [AssociationDemoCommittee_])
    Results: AssociationDemoCommittee_[];

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

@Resolver(AssociationDemoCommittee_)
export class AssociationDemoCommitteeResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCommitteeViewResult)
    async RunAssociationDemoCommitteeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCommitteeViewResult)
    async RunAssociationDemoCommitteeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCommitteeViewResult)
    async RunAssociationDemoCommitteeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Committees';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCommittee_, { nullable: true })
    async AssociationDemoCommittee(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCommittee_ | null> {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCommittees] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Committees', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCommitteeMembership_])
    async CommitteeMemberships_CommitteeIDArray(@Root() associationdemocommittee_: AssociationDemoCommittee_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCommitteeMemberships] WHERE [CommitteeID]='${associationdemocommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committee Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCommittee_)
    async CreateAssociationDemoCommittee(
        @Arg('input', () => CreateAssociationDemoCommitteeInput) input: CreateAssociationDemoCommitteeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Committees', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCommittee_)
    async UpdateAssociationDemoCommittee(
        @Arg('input', () => UpdateAssociationDemoCommitteeInput) input: UpdateAssociationDemoCommitteeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Committees', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCommittee_)
    async DeleteAssociationDemoCommittee(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Committees', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Competition Entries
//****************************************************************************
@ObjectType()
export class AssociationDemoCompetitionEntry_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    CompetitionID: string;
        
    @Field() 
    @MaxLength(16)
    ProductID: string;
        
    @Field() 
    @MaxLength(16)
    CategoryID: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    EntryNumber?: string;
        
    @Field() 
    @MaxLength(3)
    SubmittedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field(() => Float, {nullable: true}) 
    Score?: number;
        
    @Field(() => Int, {nullable: true}) 
    Ranking?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    AwardLevel?: string;
        
    @Field({nullable: true}) 
    JudgingNotes?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    FeedbackProvided?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    EntryFee?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    PaymentStatus?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Competition: string;
        
    @Field() 
    @MaxLength(510)
    Product: string;
        
    @Field() 
    @MaxLength(510)
    Category: string;
        
    @Field(() => [AssociationDemoProductAward_])
    ProductAwards_CompetitionEntryIDArray: AssociationDemoProductAward_[]; // Link to ProductAwards
    
}

//****************************************************************************
// INPUT TYPE for Competition Entries
//****************************************************************************
@InputType()
export class CreateAssociationDemoCompetitionEntryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompetitionID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    EntryNumber: string | null;

    @Field({ nullable: true })
    SubmittedDate?: Date;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Float, { nullable: true })
    Score: number | null;

    @Field(() => Int, { nullable: true })
    Ranking: number | null;

    @Field({ nullable: true })
    AwardLevel: string | null;

    @Field({ nullable: true })
    JudgingNotes: string | null;

    @Field(() => Boolean, { nullable: true })
    FeedbackProvided?: boolean | null;

    @Field(() => Float, { nullable: true })
    EntryFee: number | null;

    @Field({ nullable: true })
    PaymentStatus?: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Competition Entries
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCompetitionEntryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CompetitionID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    EntryNumber?: string | null;

    @Field({ nullable: true })
    SubmittedDate?: Date;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Float, { nullable: true })
    Score?: number | null;

    @Field(() => Int, { nullable: true })
    Ranking?: number | null;

    @Field({ nullable: true })
    AwardLevel?: string | null;

    @Field({ nullable: true })
    JudgingNotes?: string | null;

    @Field(() => Boolean, { nullable: true })
    FeedbackProvided?: boolean | null;

    @Field(() => Float, { nullable: true })
    EntryFee?: number | null;

    @Field({ nullable: true })
    PaymentStatus?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Competition Entries
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCompetitionEntryViewResult {
    @Field(() => [AssociationDemoCompetitionEntry_])
    Results: AssociationDemoCompetitionEntry_[];

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

@Resolver(AssociationDemoCompetitionEntry_)
export class AssociationDemoCompetitionEntryResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCompetitionEntryViewResult)
    async RunAssociationDemoCompetitionEntryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCompetitionEntryViewResult)
    async RunAssociationDemoCompetitionEntryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCompetitionEntryViewResult)
    async RunAssociationDemoCompetitionEntryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Competition Entries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCompetitionEntry_, { nullable: true })
    async AssociationDemoCompetitionEntry(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCompetitionEntry_ | null> {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionEntries] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Competition Entries', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoProductAward_])
    async ProductAwards_CompetitionEntryIDArray(@Root() associationdemocompetitionentry_: AssociationDemoCompetitionEntry_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProductAwards] WHERE [CompetitionEntryID]='${associationdemocompetitionentry_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Product Awards', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCompetitionEntry_)
    async CreateAssociationDemoCompetitionEntry(
        @Arg('input', () => CreateAssociationDemoCompetitionEntryInput) input: CreateAssociationDemoCompetitionEntryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Competition Entries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCompetitionEntry_)
    async UpdateAssociationDemoCompetitionEntry(
        @Arg('input', () => UpdateAssociationDemoCompetitionEntryInput) input: UpdateAssociationDemoCompetitionEntryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Competition Entries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCompetitionEntry_)
    async DeleteAssociationDemoCompetitionEntry(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Competition Entries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Competition Judges
//****************************************************************************
@ObjectType()
export class AssociationDemoCompetitionJudge_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    CompetitionID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    MemberID?: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Organization?: string;
        
    @Field({nullable: true}) 
    Credentials?: string;
        
    @Field(() => Int, {nullable: true}) 
    YearsExperience?: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Specialty?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Role?: string;
        
    @Field({nullable: true}) 
    AssignedCategories?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    InvitedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    ConfirmedDate?: Date;
        
    @Field(() => Float, {nullable: true}) 
    CompensationAmount?: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Competition: string;
        
}

//****************************************************************************
// INPUT TYPE for Competition Judges
//****************************************************************************
@InputType()
export class CreateAssociationDemoCompetitionJudgeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompetitionID?: string;

    @Field({ nullable: true })
    MemberID: string | null;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    Credentials: string | null;

    @Field(() => Int, { nullable: true })
    YearsExperience: number | null;

    @Field({ nullable: true })
    Specialty: string | null;

    @Field({ nullable: true })
    Role: string | null;

    @Field({ nullable: true })
    AssignedCategories: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    InvitedDate: Date | null;

    @Field({ nullable: true })
    ConfirmedDate: Date | null;

    @Field(() => Float, { nullable: true })
    CompensationAmount: number | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Competition Judges
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCompetitionJudgeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CompetitionID?: string;

    @Field({ nullable: true })
    MemberID?: string | null;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    Credentials?: string | null;

    @Field(() => Int, { nullable: true })
    YearsExperience?: number | null;

    @Field({ nullable: true })
    Specialty?: string | null;

    @Field({ nullable: true })
    Role?: string | null;

    @Field({ nullable: true })
    AssignedCategories?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    InvitedDate?: Date | null;

    @Field({ nullable: true })
    ConfirmedDate?: Date | null;

    @Field(() => Float, { nullable: true })
    CompensationAmount?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Competition Judges
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCompetitionJudgeViewResult {
    @Field(() => [AssociationDemoCompetitionJudge_])
    Results: AssociationDemoCompetitionJudge_[];

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

@Resolver(AssociationDemoCompetitionJudge_)
export class AssociationDemoCompetitionJudgeResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCompetitionJudgeViewResult)
    async RunAssociationDemoCompetitionJudgeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCompetitionJudgeViewResult)
    async RunAssociationDemoCompetitionJudgeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCompetitionJudgeViewResult)
    async RunAssociationDemoCompetitionJudgeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Competition Judges';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCompetitionJudge_, { nullable: true })
    async AssociationDemoCompetitionJudge(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCompetitionJudge_ | null> {
        this.CheckUserReadPermissions('Competition Judges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionJudges] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Judges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Competition Judges', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoCompetitionJudge_)
    async CreateAssociationDemoCompetitionJudge(
        @Arg('input', () => CreateAssociationDemoCompetitionJudgeInput) input: CreateAssociationDemoCompetitionJudgeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Competition Judges', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCompetitionJudge_)
    async UpdateAssociationDemoCompetitionJudge(
        @Arg('input', () => UpdateAssociationDemoCompetitionJudgeInput) input: UpdateAssociationDemoCompetitionJudgeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Competition Judges', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCompetitionJudge_)
    async DeleteAssociationDemoCompetitionJudge(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Competition Judges', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Competitions
//****************************************************************************
@ObjectType()
export class AssociationDemoCompetition_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field(() => Int) 
    Year: number;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(3)
    StartDate: Date;
        
    @Field() 
    @MaxLength(3)
    EndDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    JudgingDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    AwardsDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Location?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    EntryDeadline?: Date;
        
    @Field(() => Float, {nullable: true}) 
    EntryFee?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field(() => Int, {nullable: true}) 
    TotalEntries?: number;
        
    @Field(() => Int, {nullable: true}) 
    TotalCategories?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ContactEmail?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsAnnual?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsInternational?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCompetitionEntry_])
    CompetitionEntries_CompetitionIDArray: AssociationDemoCompetitionEntry_[]; // Link to CompetitionEntries
    
    @Field(() => [AssociationDemoCompetitionJudge_])
    CompetitionJudges_CompetitionIDArray: AssociationDemoCompetitionJudge_[]; // Link to CompetitionJudges
    
    @Field(() => [AssociationDemoProductAward_])
    ProductAwards_CompetitionIDArray: AssociationDemoProductAward_[]; // Link to ProductAwards
    
}

//****************************************************************************
// INPUT TYPE for Competitions
//****************************************************************************
@InputType()
export class CreateAssociationDemoCompetitionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    Year?: number;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    JudgingDate: Date | null;

    @Field({ nullable: true })
    AwardsDate: Date | null;

    @Field({ nullable: true })
    Location: string | null;

    @Field({ nullable: true })
    EntryDeadline: Date | null;

    @Field(() => Float, { nullable: true })
    EntryFee: number | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Int, { nullable: true })
    TotalEntries?: number | null;

    @Field(() => Int, { nullable: true })
    TotalCategories?: number | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    ContactEmail: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAnnual?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsInternational?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Competitions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCompetitionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    Year?: number;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    JudgingDate?: Date | null;

    @Field({ nullable: true })
    AwardsDate?: Date | null;

    @Field({ nullable: true })
    Location?: string | null;

    @Field({ nullable: true })
    EntryDeadline?: Date | null;

    @Field(() => Float, { nullable: true })
    EntryFee?: number | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => Int, { nullable: true })
    TotalEntries?: number | null;

    @Field(() => Int, { nullable: true })
    TotalCategories?: number | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    ContactEmail?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAnnual?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsInternational?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Competitions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCompetitionViewResult {
    @Field(() => [AssociationDemoCompetition_])
    Results: AssociationDemoCompetition_[];

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

@Resolver(AssociationDemoCompetition_)
export class AssociationDemoCompetitionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCompetitionViewResult)
    async RunAssociationDemoCompetitionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCompetitionViewResult)
    async RunAssociationDemoCompetitionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCompetitionViewResult)
    async RunAssociationDemoCompetitionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Competitions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCompetition_, { nullable: true })
    async AssociationDemoCompetition(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCompetition_ | null> {
        this.CheckUserReadPermissions('Competitions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competitions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Competitions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCompetitionEntry_])
    async CompetitionEntries_CompetitionIDArray(@Root() associationdemocompetition_: AssociationDemoCompetition_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionEntries] WHERE [CompetitionID]='${associationdemocompetition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Entries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCompetitionJudge_])
    async CompetitionJudges_CompetitionIDArray(@Root() associationdemocompetition_: AssociationDemoCompetition_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Judges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionJudges] WHERE [CompetitionID]='${associationdemocompetition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Judges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Judges', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProductAward_])
    async ProductAwards_CompetitionIDArray(@Root() associationdemocompetition_: AssociationDemoCompetition_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProductAwards] WHERE [CompetitionID]='${associationdemocompetition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Product Awards', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCompetition_)
    async CreateAssociationDemoCompetition(
        @Arg('input', () => CreateAssociationDemoCompetitionInput) input: CreateAssociationDemoCompetitionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Competitions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCompetition_)
    async UpdateAssociationDemoCompetition(
        @Arg('input', () => UpdateAssociationDemoCompetitionInput) input: UpdateAssociationDemoCompetitionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Competitions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCompetition_)
    async DeleteAssociationDemoCompetition(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Competitions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Continuing Educations
//****************************************************************************
@ObjectType()
export class AssociationDemoContinuingEducation_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CertificationID?: string;
        
    @Field() 
    @MaxLength(1000)
    ActivityTitle: string;
        
    @Field() 
    @MaxLength(200)
    ActivityType: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Provider?: string;
        
    @Field() 
    @MaxLength(3)
    CompletionDate: Date;
        
    @Field(() => Float) 
    CreditsEarned: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    CreditsType?: string;
        
    @Field(() => Float, {nullable: true}) 
    HoursSpent?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    VerificationCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    DocumentURL?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Continuing Educations
//****************************************************************************
@InputType()
export class CreateAssociationDemoContinuingEducationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    CertificationID: string | null;

    @Field({ nullable: true })
    ActivityTitle?: string;

    @Field({ nullable: true })
    ActivityType?: string;

    @Field({ nullable: true })
    Provider: string | null;

    @Field({ nullable: true })
    CompletionDate?: Date;

    @Field(() => Float, { nullable: true })
    CreditsEarned?: number;

    @Field({ nullable: true })
    CreditsType?: string | null;

    @Field(() => Float, { nullable: true })
    HoursSpent: number | null;

    @Field({ nullable: true })
    VerificationCode: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    DocumentURL: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Continuing Educations
//****************************************************************************
@InputType()
export class UpdateAssociationDemoContinuingEducationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    CertificationID?: string | null;

    @Field({ nullable: true })
    ActivityTitle?: string;

    @Field({ nullable: true })
    ActivityType?: string;

    @Field({ nullable: true })
    Provider?: string | null;

    @Field({ nullable: true })
    CompletionDate?: Date;

    @Field(() => Float, { nullable: true })
    CreditsEarned?: number;

    @Field({ nullable: true })
    CreditsType?: string | null;

    @Field(() => Float, { nullable: true })
    HoursSpent?: number | null;

    @Field({ nullable: true })
    VerificationCode?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    DocumentURL?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Continuing Educations
//****************************************************************************
@ObjectType()
export class RunAssociationDemoContinuingEducationViewResult {
    @Field(() => [AssociationDemoContinuingEducation_])
    Results: AssociationDemoContinuingEducation_[];

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

@Resolver(AssociationDemoContinuingEducation_)
export class AssociationDemoContinuingEducationResolver extends ResolverBase {
    @Query(() => RunAssociationDemoContinuingEducationViewResult)
    async RunAssociationDemoContinuingEducationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoContinuingEducationViewResult)
    async RunAssociationDemoContinuingEducationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoContinuingEducationViewResult)
    async RunAssociationDemoContinuingEducationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Continuing Educations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoContinuingEducation_, { nullable: true })
    async AssociationDemoContinuingEducation(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoContinuingEducation_ | null> {
        this.CheckUserReadPermissions('Continuing Educations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwContinuingEducations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Continuing Educations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Continuing Educations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoContinuingEducation_)
    async CreateAssociationDemoContinuingEducation(
        @Arg('input', () => CreateAssociationDemoContinuingEducationInput) input: CreateAssociationDemoContinuingEducationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Continuing Educations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoContinuingEducation_)
    async UpdateAssociationDemoContinuingEducation(
        @Arg('input', () => UpdateAssociationDemoContinuingEducationInput) input: UpdateAssociationDemoContinuingEducationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Continuing Educations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoContinuingEducation_)
    async DeleteAssociationDemoContinuingEducation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Continuing Educations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Courses
//****************************************************************************
@ObjectType({ description: `Educational courses and certification programs offered by the association` })
export class AssociationDemoCourse_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Unique course code`}) 
    @MaxLength(100)
    Code: string;
        
    @Field({description: `Course title`}) 
    @MaxLength(510)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field({description: `Course difficulty level: Beginner, Intermediate, Advanced, or Expert`}) 
    @MaxLength(40)
    Level: string;
        
    @Field(() => Float, {nullable: true, description: `Estimated duration in hours`}) 
    DurationHours?: number;
        
    @Field(() => Float, {nullable: true, description: `Continuing Education Unit credits awarded`}) 
    CEUCredits?: number;
        
    @Field(() => Float, {nullable: true, description: `Standard price for non-members`}) 
    Price?: number;
        
    @Field(() => Float, {nullable: true, description: `Discounted price for members`}) 
    MemberPrice?: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    PublishedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    InstructorName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    PrerequisiteCourseID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    ThumbnailURL?: string;
        
    @Field({nullable: true}) 
    LearningObjectives?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootPrerequisiteCourseID?: string;
        
    @Field(() => [AssociationDemoCourse_])
    Courses_PrerequisiteCourseIDArray: AssociationDemoCourse_[]; // Link to Courses
    
    @Field(() => [AssociationDemoEnrollment_])
    Enrollments_CourseIDArray: AssociationDemoEnrollment_[]; // Link to Enrollments
    
}

//****************************************************************************
// INPUT TYPE for Courses
//****************************************************************************
@InputType()
export class CreateAssociationDemoCourseInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Category: string | null;

    @Field({ nullable: true })
    Level?: string;

    @Field(() => Float, { nullable: true })
    DurationHours: number | null;

    @Field(() => Float, { nullable: true })
    CEUCredits: number | null;

    @Field(() => Float, { nullable: true })
    Price: number | null;

    @Field(() => Float, { nullable: true })
    MemberPrice: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    PublishedDate: Date | null;

    @Field({ nullable: true })
    InstructorName: string | null;

    @Field({ nullable: true })
    PrerequisiteCourseID: string | null;

    @Field({ nullable: true })
    ThumbnailURL: string | null;

    @Field({ nullable: true })
    LearningObjectives: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Courses
//****************************************************************************
@InputType()
export class UpdateAssociationDemoCourseInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Category?: string | null;

    @Field({ nullable: true })
    Level?: string;

    @Field(() => Float, { nullable: true })
    DurationHours?: number | null;

    @Field(() => Float, { nullable: true })
    CEUCredits?: number | null;

    @Field(() => Float, { nullable: true })
    Price?: number | null;

    @Field(() => Float, { nullable: true })
    MemberPrice?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    PublishedDate?: Date | null;

    @Field({ nullable: true })
    InstructorName?: string | null;

    @Field({ nullable: true })
    PrerequisiteCourseID?: string | null;

    @Field({ nullable: true })
    ThumbnailURL?: string | null;

    @Field({ nullable: true })
    LearningObjectives?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Courses
//****************************************************************************
@ObjectType()
export class RunAssociationDemoCourseViewResult {
    @Field(() => [AssociationDemoCourse_])
    Results: AssociationDemoCourse_[];

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

@Resolver(AssociationDemoCourse_)
export class AssociationDemoCourseResolver extends ResolverBase {
    @Query(() => RunAssociationDemoCourseViewResult)
    async RunAssociationDemoCourseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCourseViewResult)
    async RunAssociationDemoCourseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoCourseViewResult)
    async RunAssociationDemoCourseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Courses';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoCourse_, { nullable: true })
    async AssociationDemoCourse(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCourse_ | null> {
        this.CheckUserReadPermissions('Courses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCourses] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Courses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Courses', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCourse_])
    async Courses_PrerequisiteCourseIDArray(@Root() associationdemocourse_: AssociationDemoCourse_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Courses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCourses] WHERE [PrerequisiteCourseID]='${associationdemocourse_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Courses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Courses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEnrollment_])
    async Enrollments_CourseIDArray(@Root() associationdemocourse_: AssociationDemoCourse_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Enrollments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEnrollments] WHERE [CourseID]='${associationdemocourse_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Enrollments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Enrollments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoCourse_)
    async CreateAssociationDemoCourse(
        @Arg('input', () => CreateAssociationDemoCourseInput) input: CreateAssociationDemoCourseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Courses', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoCourse_)
    async UpdateAssociationDemoCourse(
        @Arg('input', () => UpdateAssociationDemoCourseInput) input: UpdateAssociationDemoCourseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Courses', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoCourse_)
    async DeleteAssociationDemoCourse(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Courses', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Clicks
//****************************************************************************
@ObjectType({ description: `Individual click tracking for links within emails` })
export class AssociationDemoEmailClick_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Email send this click is associated with`}) 
    @MaxLength(16)
    EmailSendID: string;
        
    @Field({description: `Date and time link was clicked`}) 
    @MaxLength(8)
    ClickDate: Date;
        
    @Field({description: `URL that was clicked`}) 
    @MaxLength(4000)
    URL: string;
        
    @Field({nullable: true, description: `Friendly name for the link`}) 
    @MaxLength(510)
    LinkName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    IPAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    UserAgent?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Clicks
//****************************************************************************
@InputType()
export class CreateAssociationDemoEmailClickInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EmailSendID?: string;

    @Field({ nullable: true })
    ClickDate?: Date;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    LinkName: string | null;

    @Field({ nullable: true })
    IPAddress: string | null;

    @Field({ nullable: true })
    UserAgent: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Email Clicks
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEmailClickInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EmailSendID?: string;

    @Field({ nullable: true })
    ClickDate?: Date;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    LinkName?: string | null;

    @Field({ nullable: true })
    IPAddress?: string | null;

    @Field({ nullable: true })
    UserAgent?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Email Clicks
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEmailClickViewResult {
    @Field(() => [AssociationDemoEmailClick_])
    Results: AssociationDemoEmailClick_[];

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

@Resolver(AssociationDemoEmailClick_)
export class AssociationDemoEmailClickResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEmailClickViewResult)
    async RunAssociationDemoEmailClickViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEmailClickViewResult)
    async RunAssociationDemoEmailClickViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEmailClickViewResult)
    async RunAssociationDemoEmailClickDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Clicks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEmailClick_, { nullable: true })
    async AssociationDemoEmailClick(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEmailClick_ | null> {
        this.CheckUserReadPermissions('Email Clicks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailClicks] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Clicks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Clicks', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoEmailClick_)
    async CreateAssociationDemoEmailClick(
        @Arg('input', () => CreateAssociationDemoEmailClickInput) input: CreateAssociationDemoEmailClickInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Clicks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEmailClick_)
    async UpdateAssociationDemoEmailClick(
        @Arg('input', () => UpdateAssociationDemoEmailClickInput) input: UpdateAssociationDemoEmailClickInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Clicks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEmailClick_)
    async DeleteAssociationDemoEmailClick(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Email Clicks', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Sends
//****************************************************************************
@ObjectType({ description: `Individual email send tracking with delivery and engagement metrics` })
export class AssociationDemoEmailSend_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({nullable: true, description: `Template used for this email`}) 
    @MaxLength(16)
    TemplateID?: string;
        
    @Field({nullable: true, description: `Campaign this email is part of`}) 
    @MaxLength(16)
    CampaignID?: string;
        
    @Field({description: `Member receiving the email`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Subject?: string;
        
    @Field({description: `Date email was sent`}) 
    @MaxLength(8)
    SentDate: Date;
        
    @Field({nullable: true, description: `Date email was delivered to inbox`}) 
    @MaxLength(8)
    DeliveredDate?: Date;
        
    @Field({nullable: true, description: `Date email was first opened`}) 
    @MaxLength(8)
    OpenedDate?: Date;
        
    @Field(() => Int, {nullable: true, description: `Total number of opens`}) 
    OpenCount?: number;
        
    @Field({nullable: true, description: `Date a link was first clicked`}) 
    @MaxLength(8)
    ClickedDate?: Date;
        
    @Field(() => Int, {nullable: true, description: `Total number of clicks`}) 
    ClickCount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    BouncedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    BounceType?: string;
        
    @Field({nullable: true}) 
    BounceReason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    UnsubscribedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    SpamReportedDate?: Date;
        
    @Field({description: `Email status: Queued, Sent, Delivered, Opened, Clicked, Bounced, Spam, Unsubscribed, or Failed`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ExternalMessageID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Template?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Campaign?: string;
        
    @Field(() => [AssociationDemoEmailClick_])
    EmailClicks_EmailSendIDArray: AssociationDemoEmailClick_[]; // Link to EmailClicks
    
}

//****************************************************************************
// INPUT TYPE for Email Sends
//****************************************************************************
@InputType()
export class CreateAssociationDemoEmailSendInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TemplateID: string | null;

    @Field({ nullable: true })
    CampaignID: string | null;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    SentDate?: Date;

    @Field({ nullable: true })
    DeliveredDate: Date | null;

    @Field({ nullable: true })
    OpenedDate: Date | null;

    @Field(() => Int, { nullable: true })
    OpenCount?: number | null;

    @Field({ nullable: true })
    ClickedDate: Date | null;

    @Field(() => Int, { nullable: true })
    ClickCount?: number | null;

    @Field({ nullable: true })
    BouncedDate: Date | null;

    @Field({ nullable: true })
    BounceType: string | null;

    @Field({ nullable: true })
    BounceReason: string | null;

    @Field({ nullable: true })
    UnsubscribedDate: Date | null;

    @Field({ nullable: true })
    SpamReportedDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExternalMessageID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Email Sends
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEmailSendInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TemplateID?: string | null;

    @Field({ nullable: true })
    CampaignID?: string | null;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    SentDate?: Date;

    @Field({ nullable: true })
    DeliveredDate?: Date | null;

    @Field({ nullable: true })
    OpenedDate?: Date | null;

    @Field(() => Int, { nullable: true })
    OpenCount?: number | null;

    @Field({ nullable: true })
    ClickedDate?: Date | null;

    @Field(() => Int, { nullable: true })
    ClickCount?: number | null;

    @Field({ nullable: true })
    BouncedDate?: Date | null;

    @Field({ nullable: true })
    BounceType?: string | null;

    @Field({ nullable: true })
    BounceReason?: string | null;

    @Field({ nullable: true })
    UnsubscribedDate?: Date | null;

    @Field({ nullable: true })
    SpamReportedDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExternalMessageID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Email Sends
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEmailSendViewResult {
    @Field(() => [AssociationDemoEmailSend_])
    Results: AssociationDemoEmailSend_[];

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

@Resolver(AssociationDemoEmailSend_)
export class AssociationDemoEmailSendResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEmailSendViewResult)
    async RunAssociationDemoEmailSendViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEmailSendViewResult)
    async RunAssociationDemoEmailSendViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEmailSendViewResult)
    async RunAssociationDemoEmailSendDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Sends';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEmailSend_, { nullable: true })
    async AssociationDemoEmailSend(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEmailSend_ | null> {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailSends] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Sends', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEmailClick_])
    async EmailClicks_EmailSendIDArray(@Root() associationdemoemailsend_: AssociationDemoEmailSend_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Clicks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailClicks] WHERE [EmailSendID]='${associationdemoemailsend_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Clicks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Clicks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoEmailSend_)
    async CreateAssociationDemoEmailSend(
        @Arg('input', () => CreateAssociationDemoEmailSendInput) input: CreateAssociationDemoEmailSendInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Sends', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEmailSend_)
    async UpdateAssociationDemoEmailSend(
        @Arg('input', () => UpdateAssociationDemoEmailSendInput) input: UpdateAssociationDemoEmailSendInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Sends', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEmailSend_)
    async DeleteAssociationDemoEmailSend(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Email Sends', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Templates
//****************************************************************************
@ObjectType({ description: `Reusable email templates for automated communications` })
export class AssociationDemoEmailTemplate_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Template name for identification`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Email subject line (may contain merge fields)`}) 
    @MaxLength(1000)
    Subject?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    FromName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    FromEmail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ReplyToEmail?: string;
        
    @Field({nullable: true, description: `HTML version of email body`}) 
    HtmlBody?: string;
        
    @Field({nullable: true, description: `Plain text version of email body`}) 
    TextBody?: string;
        
    @Field({nullable: true, description: `Template category (Welcome, Renewal, Event, Newsletter, etc.)`}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    PreviewText?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Tags?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoEmailSend_])
    EmailSends_TemplateIDArray: AssociationDemoEmailSend_[]; // Link to EmailSends
    
}

//****************************************************************************
// INPUT TYPE for Email Templates
//****************************************************************************
@InputType()
export class CreateAssociationDemoEmailTemplateInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    FromName: string | null;

    @Field({ nullable: true })
    FromEmail: string | null;

    @Field({ nullable: true })
    ReplyToEmail: string | null;

    @Field({ nullable: true })
    HtmlBody: string | null;

    @Field({ nullable: true })
    TextBody: string | null;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    PreviewText: string | null;

    @Field({ nullable: true })
    Tags: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Email Templates
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEmailTemplateInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    FromName?: string | null;

    @Field({ nullable: true })
    FromEmail?: string | null;

    @Field({ nullable: true })
    ReplyToEmail?: string | null;

    @Field({ nullable: true })
    HtmlBody?: string | null;

    @Field({ nullable: true })
    TextBody?: string | null;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    PreviewText?: string | null;

    @Field({ nullable: true })
    Tags?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Email Templates
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEmailTemplateViewResult {
    @Field(() => [AssociationDemoEmailTemplate_])
    Results: AssociationDemoEmailTemplate_[];

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

@Resolver(AssociationDemoEmailTemplate_)
export class AssociationDemoEmailTemplateResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEmailTemplateViewResult)
    async RunAssociationDemoEmailTemplateViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEmailTemplateViewResult)
    async RunAssociationDemoEmailTemplateViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEmailTemplateViewResult)
    async RunAssociationDemoEmailTemplateDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Templates';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEmailTemplate_, { nullable: true })
    async AssociationDemoEmailTemplate(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEmailTemplate_ | null> {
        this.CheckUserReadPermissions('Email Templates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailTemplates] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Templates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Templates', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEmailSend_])
    async EmailSends_TemplateIDArray(@Root() associationdemoemailtemplate_: AssociationDemoEmailTemplate_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailSends] WHERE [TemplateID]='${associationdemoemailtemplate_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Sends', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoEmailTemplate_)
    async CreateAssociationDemoEmailTemplate(
        @Arg('input', () => CreateAssociationDemoEmailTemplateInput) input: CreateAssociationDemoEmailTemplateInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Templates', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEmailTemplate_)
    async UpdateAssociationDemoEmailTemplate(
        @Arg('input', () => UpdateAssociationDemoEmailTemplateInput) input: UpdateAssociationDemoEmailTemplateInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Templates', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEmailTemplate_)
    async DeleteAssociationDemoEmailTemplate(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Email Templates', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Enrollments
//****************************************************************************
@ObjectType({ description: `Member course enrollments and progress tracking` })
export class AssociationDemoEnrollment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Course being taken`}) 
    @MaxLength(16)
    CourseID: string;
        
    @Field({description: `Member taking the course`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Date member enrolled`}) 
    @MaxLength(8)
    EnrollmentDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    StartDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    CompletionDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ExpirationDate?: Date;
        
    @Field({description: `Enrollment status: Enrolled, In Progress, Completed, Failed, Withdrawn, or Expired`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Int, {nullable: true, description: `Course completion progress (0-100%)`}) 
    ProgressPercentage?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastAccessedDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    TimeSpentMinutes?: number;
        
    @Field(() => Float, {nullable: true, description: `Final exam or assessment score`}) 
    FinalScore?: number;
        
    @Field(() => Float, {nullable: true}) 
    PassingScore?: number;
        
    @Field(() => Boolean, {nullable: true, description: `Whether the member passed the course`}) 
    Passed?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    InvoiceID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCertificate_])
    Certificates_EnrollmentIDArray: AssociationDemoCertificate_[]; // Link to Certificates
    
}

//****************************************************************************
// INPUT TYPE for Enrollments
//****************************************************************************
@InputType()
export class CreateAssociationDemoEnrollmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CourseID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    EnrollmentDate?: Date;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    CompletionDate: Date | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    ProgressPercentage?: number | null;

    @Field({ nullable: true })
    LastAccessedDate: Date | null;

    @Field(() => Int, { nullable: true })
    TimeSpentMinutes?: number | null;

    @Field(() => Float, { nullable: true })
    FinalScore: number | null;

    @Field(() => Float, { nullable: true })
    PassingScore?: number | null;

    @Field(() => Boolean, { nullable: true })
    Passed: boolean | null;

    @Field({ nullable: true })
    InvoiceID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Enrollments
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEnrollmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CourseID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    EnrollmentDate?: Date;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    CompletionDate?: Date | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    ProgressPercentage?: number | null;

    @Field({ nullable: true })
    LastAccessedDate?: Date | null;

    @Field(() => Int, { nullable: true })
    TimeSpentMinutes?: number | null;

    @Field(() => Float, { nullable: true })
    FinalScore?: number | null;

    @Field(() => Float, { nullable: true })
    PassingScore?: number | null;

    @Field(() => Boolean, { nullable: true })
    Passed?: boolean | null;

    @Field({ nullable: true })
    InvoiceID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Enrollments
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEnrollmentViewResult {
    @Field(() => [AssociationDemoEnrollment_])
    Results: AssociationDemoEnrollment_[];

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

@Resolver(AssociationDemoEnrollment_)
export class AssociationDemoEnrollmentResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEnrollmentViewResult)
    async RunAssociationDemoEnrollmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEnrollmentViewResult)
    async RunAssociationDemoEnrollmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEnrollmentViewResult)
    async RunAssociationDemoEnrollmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Enrollments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEnrollment_, { nullable: true })
    async AssociationDemoEnrollment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEnrollment_ | null> {
        this.CheckUserReadPermissions('Enrollments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEnrollments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Enrollments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Enrollments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificate_])
    async Certificates_EnrollmentIDArray(@Root() associationdemoenrollment_: AssociationDemoEnrollment_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certificates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertificates] WHERE [EnrollmentID]='${associationdemoenrollment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certificates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certificates', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoEnrollment_)
    async CreateAssociationDemoEnrollment(
        @Arg('input', () => CreateAssociationDemoEnrollmentInput) input: CreateAssociationDemoEnrollmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Enrollments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEnrollment_)
    async UpdateAssociationDemoEnrollment(
        @Arg('input', () => UpdateAssociationDemoEnrollmentInput) input: UpdateAssociationDemoEnrollmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Enrollments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEnrollment_)
    async DeleteAssociationDemoEnrollment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Enrollments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Registrations
//****************************************************************************
@ObjectType({ description: `Member registrations and attendance tracking for events` })
export class AssociationDemoEventRegistration_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Event being registered for`}) 
    @MaxLength(16)
    EventID: string;
        
    @Field({description: `Member registering for the event`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Date and time of registration`}) 
    @MaxLength(8)
    RegistrationDate: Date;
        
    @Field({nullable: true, description: `Type of registration (Early Bird, Standard, Late, etc.)`}) 
    @MaxLength(100)
    RegistrationType?: string;
        
    @Field({description: `Registration status: Registered, Waitlisted, Attended, No Show, or Cancelled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `Time attendee checked in to the event`}) 
    @MaxLength(8)
    CheckInTime?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    InvoiceID?: string;
        
    @Field(() => Boolean, {description: `Whether CEU credits were awarded`}) 
    CEUAwarded: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    CEUAwardedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    CancellationDate?: Date;
        
    @Field({nullable: true}) 
    CancellationReason?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Event: string;
        
}

//****************************************************************************
// INPUT TYPE for Event Registrations
//****************************************************************************
@InputType()
export class CreateAssociationDemoEventRegistrationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    RegistrationDate?: Date;

    @Field({ nullable: true })
    RegistrationType: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CheckInTime: Date | null;

    @Field({ nullable: true })
    InvoiceID: string | null;

    @Field(() => Boolean, { nullable: true })
    CEUAwarded?: boolean;

    @Field({ nullable: true })
    CEUAwardedDate: Date | null;

    @Field({ nullable: true })
    CancellationDate: Date | null;

    @Field({ nullable: true })
    CancellationReason: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Registrations
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEventRegistrationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    RegistrationDate?: Date;

    @Field({ nullable: true })
    RegistrationType?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CheckInTime?: Date | null;

    @Field({ nullable: true })
    InvoiceID?: string | null;

    @Field(() => Boolean, { nullable: true })
    CEUAwarded?: boolean;

    @Field({ nullable: true })
    CEUAwardedDate?: Date | null;

    @Field({ nullable: true })
    CancellationDate?: Date | null;

    @Field({ nullable: true })
    CancellationReason?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Registrations
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEventRegistrationViewResult {
    @Field(() => [AssociationDemoEventRegistration_])
    Results: AssociationDemoEventRegistration_[];

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

@Resolver(AssociationDemoEventRegistration_)
export class AssociationDemoEventRegistrationResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEventRegistrationViewResult)
    async RunAssociationDemoEventRegistrationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEventRegistrationViewResult)
    async RunAssociationDemoEventRegistrationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEventRegistrationViewResult)
    async RunAssociationDemoEventRegistrationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Registrations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEventRegistration_, { nullable: true })
    async AssociationDemoEventRegistration(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEventRegistration_ | null> {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEventRegistrations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Registrations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoEventRegistration_)
    async CreateAssociationDemoEventRegistration(
        @Arg('input', () => CreateAssociationDemoEventRegistrationInput) input: CreateAssociationDemoEventRegistrationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Registrations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEventRegistration_)
    async UpdateAssociationDemoEventRegistration(
        @Arg('input', () => UpdateAssociationDemoEventRegistrationInput) input: UpdateAssociationDemoEventRegistrationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Registrations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEventRegistration_)
    async DeleteAssociationDemoEventRegistration(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Event Registrations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Sessions
//****************************************************************************
@ObjectType({ description: `Individual sessions within multi-track events` })
export class AssociationDemoEventSession_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Parent event`}) 
    @MaxLength(16)
    EventID: string;
        
    @Field({description: `Session name or title`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(8)
    StartTime: Date;
        
    @Field() 
    @MaxLength(8)
    EndTime: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Room?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    SpeakerName?: string;
        
    @Field({nullable: true, description: `Session type (Keynote, Workshop, Panel, etc.)`}) 
    @MaxLength(100)
    SessionType?: string;
        
    @Field(() => Int, {nullable: true}) 
    Capacity?: number;
        
    @Field(() => Float, {nullable: true}) 
    CEUCredits?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Event: string;
        
}

//****************************************************************************
// INPUT TYPE for Event Sessions
//****************************************************************************
@InputType()
export class CreateAssociationDemoEventSessionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Room: string | null;

    @Field({ nullable: true })
    SpeakerName: string | null;

    @Field({ nullable: true })
    SessionType: string | null;

    @Field(() => Int, { nullable: true })
    Capacity: number | null;

    @Field(() => Float, { nullable: true })
    CEUCredits: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Event Sessions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEventSessionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Room?: string | null;

    @Field({ nullable: true })
    SpeakerName?: string | null;

    @Field({ nullable: true })
    SessionType?: string | null;

    @Field(() => Int, { nullable: true })
    Capacity?: number | null;

    @Field(() => Float, { nullable: true })
    CEUCredits?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Sessions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEventSessionViewResult {
    @Field(() => [AssociationDemoEventSession_])
    Results: AssociationDemoEventSession_[];

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

@Resolver(AssociationDemoEventSession_)
export class AssociationDemoEventSessionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEventSessionViewResult)
    async RunAssociationDemoEventSessionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEventSessionViewResult)
    async RunAssociationDemoEventSessionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEventSessionViewResult)
    async RunAssociationDemoEventSessionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Sessions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEventSession_, { nullable: true })
    async AssociationDemoEventSession(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEventSession_ | null> {
        this.CheckUserReadPermissions('Event Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEventSessions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Sessions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoEventSession_)
    async CreateAssociationDemoEventSession(
        @Arg('input', () => CreateAssociationDemoEventSessionInput) input: CreateAssociationDemoEventSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Sessions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEventSession_)
    async UpdateAssociationDemoEventSession(
        @Arg('input', () => UpdateAssociationDemoEventSessionInput) input: UpdateAssociationDemoEventSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Sessions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEventSession_)
    async DeleteAssociationDemoEventSession(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Event Sessions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType({ description: `Events organized by the association including conferences, webinars, and meetings` })
export class AssociationDemoEvent_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Event name or title`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({description: `Type of event: Conference, Webinar, Workshop, Chapter Meeting, Virtual Summit, or Networking`}) 
    @MaxLength(100)
    EventType: string;
        
    @Field({description: `Event start date and time`}) 
    @MaxLength(8)
    StartDate: Date;
        
    @Field({description: `Event end date and time`}) 
    @MaxLength(8)
    EndDate: Date;
        
    @Field({nullable: true, description: `Event timezone (e.g., America/New_York, America/Chicago)`}) 
    @MaxLength(100)
    Timezone?: string;
        
    @Field({nullable: true, description: `Physical location or address of event`}) 
    @MaxLength(510)
    Location?: string;
        
    @Field(() => Boolean, {description: `Whether event is held virtually`}) 
    IsVirtual: boolean;
        
    @Field({nullable: true, description: `Virtual platform used (Zoom, Teams, etc.)`}) 
    @MaxLength(200)
    VirtualPlatform?: string;
        
    @Field({nullable: true, description: `URL for virtual event meeting`}) 
    @MaxLength(1000)
    MeetingURL?: string;
        
    @Field({nullable: true, description: `Associated chapter for chapter-specific events`}) 
    @MaxLength(16)
    ChapterID?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum number of attendees`}) 
    Capacity?: number;
        
    @Field({nullable: true, description: `Date when event registration opens`}) 
    @MaxLength(8)
    RegistrationOpenDate?: Date;
        
    @Field({nullable: true, description: `Date when event registration closes`}) 
    @MaxLength(8)
    RegistrationCloseDate?: Date;
        
    @Field(() => Float, {nullable: true, description: `Base registration fee (deprecated - use MemberPrice/NonMemberPrice instead)`}) 
    RegistrationFee?: number;
        
    @Field(() => Float, {nullable: true, description: `Registration price for association members. Invoices are automatically generated for event registrations using this price for members.`}) 
    MemberPrice?: number;
        
    @Field(() => Float, {nullable: true, description: `Registration price for non-members (higher than MemberPrice to incentivize membership)`}) 
    NonMemberPrice?: number;
        
    @Field(() => Float, {nullable: true, description: `Continuing Education Unit credits offered`}) 
    CEUCredits?: number;
        
    @Field({nullable: true, description: `Event description and details`}) 
    Description?: string;
        
    @Field({description: `Current event status: Draft, Published, Registration Open, Sold Out, In Progress, Completed, or Cancelled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoEventSession_])
    EventSessions_EventIDArray: AssociationDemoEventSession_[]; // Link to EventSessions
    
    @Field(() => [AssociationDemoEventRegistration_])
    EventRegistrations_EventIDArray: AssociationDemoEventRegistration_[]; // Link to EventRegistrations
    
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreateAssociationDemoEventInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    EventType?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    Timezone: string | null;

    @Field({ nullable: true })
    Location: string | null;

    @Field(() => Boolean, { nullable: true })
    IsVirtual?: boolean;

    @Field({ nullable: true })
    VirtualPlatform: string | null;

    @Field({ nullable: true })
    MeetingURL: string | null;

    @Field({ nullable: true })
    ChapterID: string | null;

    @Field(() => Int, { nullable: true })
    Capacity: number | null;

    @Field({ nullable: true })
    RegistrationOpenDate: Date | null;

    @Field({ nullable: true })
    RegistrationCloseDate: Date | null;

    @Field(() => Float, { nullable: true })
    RegistrationFee: number | null;

    @Field(() => Float, { nullable: true })
    MemberPrice: number | null;

    @Field(() => Float, { nullable: true })
    NonMemberPrice: number | null;

    @Field(() => Float, { nullable: true })
    CEUCredits: number | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdateAssociationDemoEventInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    EventType?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    Timezone?: string | null;

    @Field({ nullable: true })
    Location?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsVirtual?: boolean;

    @Field({ nullable: true })
    VirtualPlatform?: string | null;

    @Field({ nullable: true })
    MeetingURL?: string | null;

    @Field({ nullable: true })
    ChapterID?: string | null;

    @Field(() => Int, { nullable: true })
    Capacity?: number | null;

    @Field({ nullable: true })
    RegistrationOpenDate?: Date | null;

    @Field({ nullable: true })
    RegistrationCloseDate?: Date | null;

    @Field(() => Float, { nullable: true })
    RegistrationFee?: number | null;

    @Field(() => Float, { nullable: true })
    MemberPrice?: number | null;

    @Field(() => Float, { nullable: true })
    NonMemberPrice?: number | null;

    @Field(() => Float, { nullable: true })
    CEUCredits?: number | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunAssociationDemoEventViewResult {
    @Field(() => [AssociationDemoEvent_])
    Results: AssociationDemoEvent_[];

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

@Resolver(AssociationDemoEvent_)
export class AssociationDemoEventResolver extends ResolverBase {
    @Query(() => RunAssociationDemoEventViewResult)
    async RunAssociationDemoEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEventViewResult)
    async RunAssociationDemoEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoEventViewResult)
    async RunAssociationDemoEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoEvent_, { nullable: true })
    async AssociationDemoEvent(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEvent_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEvents] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEventSession_])
    async EventSessions_EventIDArray(@Root() associationdemoevent_: AssociationDemoEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEventSessions] WHERE [EventID]='${associationdemoevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Sessions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEventRegistration_])
    async EventRegistrations_EventIDArray(@Root() associationdemoevent_: AssociationDemoEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEventRegistrations] WHERE [EventID]='${associationdemoevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoEvent_)
    async CreateAssociationDemoEvent(
        @Arg('input', () => CreateAssociationDemoEventInput) input: CreateAssociationDemoEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoEvent_)
    async UpdateAssociationDemoEvent(
        @Arg('input', () => UpdateAssociationDemoEventInput) input: UpdateAssociationDemoEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoEvent_)
    async DeleteAssociationDemoEvent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Flyway _schema _histories
//****************************************************************************
@ObjectType()
export class AssociationDemoflywayschemahistory_ {
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
// INPUT TYPE for Flyway _schema _histories
//****************************************************************************
@InputType()
export class CreateAssociationDemoflywayschemahistoryInput {
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
// INPUT TYPE for Flyway _schema _histories
//****************************************************************************
@InputType()
export class UpdateAssociationDemoflywayschemahistoryInput {
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
// RESOLVER for Flyway _schema _histories
//****************************************************************************
@ObjectType()
export class RunAssociationDemoflywayschemahistoryViewResult {
    @Field(() => [AssociationDemoflywayschemahistory_])
    Results: AssociationDemoflywayschemahistory_[];

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

@Resolver(AssociationDemoflywayschemahistory_)
export class AssociationDemoflywayschemahistoryResolver extends ResolverBase {
    @Query(() => RunAssociationDemoflywayschemahistoryViewResult)
    async RunAssociationDemoflywayschemahistoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoflywayschemahistoryViewResult)
    async RunAssociationDemoflywayschemahistoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoflywayschemahistoryViewResult)
    async RunAssociationDemoflywayschemahistoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Flyway _schema _histories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoflywayschemahistory_, { nullable: true })
    async AssociationDemoflywayschemahistory(@Arg('installed_rank', () => Int) installed_rank: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoflywayschemahistory_ | null> {
        this.CheckUserReadPermissions('Flyway _schema _histories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwFlyway_schema_histories] WHERE [installed_rank]=${installed_rank} ` + this.getRowLevelSecurityWhereClause(provider, 'Flyway _schema _histories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Flyway _schema _histories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoflywayschemahistory_)
    async CreateAssociationDemoflywayschemahistory(
        @Arg('input', () => CreateAssociationDemoflywayschemahistoryInput) input: CreateAssociationDemoflywayschemahistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Flyway _schema _histories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoflywayschemahistory_)
    async UpdateAssociationDemoflywayschemahistory(
        @Arg('input', () => UpdateAssociationDemoflywayschemahistoryInput) input: UpdateAssociationDemoflywayschemahistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Flyway _schema _histories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoflywayschemahistory_)
    async DeleteAssociationDemoflywayschemahistory(@Arg('installed_rank', () => Int) installed_rank: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'installed_rank', Value: installed_rank}]);
        return this.DeleteRecord('Flyway _schema _histories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Forum Categories
//****************************************************************************
@ObjectType()
export class AssociationDemoForumCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentCategoryID?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Icon?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Color?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    RequiresMembership?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    ThreadCount?: number;
        
    @Field(() => Int, {nullable: true}) 
    PostCount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastPostDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    LastPostAuthorID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentCategoryID?: string;
        
    @Field(() => [AssociationDemoForumCategory_])
    ForumCategories_ParentCategoryIDArray: AssociationDemoForumCategory_[]; // Link to ForumCategories
    
    @Field(() => [AssociationDemoForumThread_])
    ForumThreads_CategoryIDArray: AssociationDemoForumThread_[]; // Link to ForumThreads
    
}

//****************************************************************************
// INPUT TYPE for Forum Categories
//****************************************************************************
@InputType()
export class CreateAssociationDemoForumCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentCategoryID: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field({ nullable: true })
    Icon: string | null;

    @Field({ nullable: true })
    Color: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    RequiresMembership?: boolean | null;

    @Field(() => Int, { nullable: true })
    ThreadCount?: number | null;

    @Field(() => Int, { nullable: true })
    PostCount?: number | null;

    @Field({ nullable: true })
    LastPostDate: Date | null;

    @Field({ nullable: true })
    LastPostAuthorID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Forum Categories
//****************************************************************************
@InputType()
export class UpdateAssociationDemoForumCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentCategoryID?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field({ nullable: true })
    Icon?: string | null;

    @Field({ nullable: true })
    Color?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    RequiresMembership?: boolean | null;

    @Field(() => Int, { nullable: true })
    ThreadCount?: number | null;

    @Field(() => Int, { nullable: true })
    PostCount?: number | null;

    @Field({ nullable: true })
    LastPostDate?: Date | null;

    @Field({ nullable: true })
    LastPostAuthorID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Forum Categories
//****************************************************************************
@ObjectType()
export class RunAssociationDemoForumCategoryViewResult {
    @Field(() => [AssociationDemoForumCategory_])
    Results: AssociationDemoForumCategory_[];

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

@Resolver(AssociationDemoForumCategory_)
export class AssociationDemoForumCategoryResolver extends ResolverBase {
    @Query(() => RunAssociationDemoForumCategoryViewResult)
    async RunAssociationDemoForumCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumCategoryViewResult)
    async RunAssociationDemoForumCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumCategoryViewResult)
    async RunAssociationDemoForumCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Forum Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoForumCategory_, { nullable: true })
    async AssociationDemoForumCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumCategory_ | null> {
        this.CheckUserReadPermissions('Forum Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoForumCategory_])
    async ForumCategories_ParentCategoryIDArray(@Root() associationdemoforumcategory_: AssociationDemoForumCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumCategories] WHERE [ParentCategoryID]='${associationdemoforumcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumThread_])
    async ForumThreads_CategoryIDArray(@Root() associationdemoforumcategory_: AssociationDemoForumCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumThreads] WHERE [CategoryID]='${associationdemoforumcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Threads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoForumCategory_)
    async CreateAssociationDemoForumCategory(
        @Arg('input', () => CreateAssociationDemoForumCategoryInput) input: CreateAssociationDemoForumCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Forum Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoForumCategory_)
    async UpdateAssociationDemoForumCategory(
        @Arg('input', () => UpdateAssociationDemoForumCategoryInput) input: UpdateAssociationDemoForumCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Forum Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoForumCategory_)
    async DeleteAssociationDemoForumCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Forum Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Forum Moderations
//****************************************************************************
@ObjectType()
export class AssociationDemoForumModeration_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PostID: string;
        
    @Field() 
    @MaxLength(16)
    ReportedByID: string;
        
    @Field() 
    @MaxLength(8)
    ReportedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    ReportReason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ModerationStatus?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ModeratedByID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ModeratedDate?: Date;
        
    @Field({nullable: true}) 
    ModeratorNotes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Action?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Forum Moderations
//****************************************************************************
@InputType()
export class CreateAssociationDemoForumModerationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    ReportedByID?: string;

    @Field({ nullable: true })
    ReportedDate?: Date;

    @Field({ nullable: true })
    ReportReason: string | null;

    @Field({ nullable: true })
    ModerationStatus?: string | null;

    @Field({ nullable: true })
    ModeratedByID: string | null;

    @Field({ nullable: true })
    ModeratedDate: Date | null;

    @Field({ nullable: true })
    ModeratorNotes: string | null;

    @Field({ nullable: true })
    Action: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Forum Moderations
//****************************************************************************
@InputType()
export class UpdateAssociationDemoForumModerationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    ReportedByID?: string;

    @Field({ nullable: true })
    ReportedDate?: Date;

    @Field({ nullable: true })
    ReportReason?: string | null;

    @Field({ nullable: true })
    ModerationStatus?: string | null;

    @Field({ nullable: true })
    ModeratedByID?: string | null;

    @Field({ nullable: true })
    ModeratedDate?: Date | null;

    @Field({ nullable: true })
    ModeratorNotes?: string | null;

    @Field({ nullable: true })
    Action?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Forum Moderations
//****************************************************************************
@ObjectType()
export class RunAssociationDemoForumModerationViewResult {
    @Field(() => [AssociationDemoForumModeration_])
    Results: AssociationDemoForumModeration_[];

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

@Resolver(AssociationDemoForumModeration_)
export class AssociationDemoForumModerationResolver extends ResolverBase {
    @Query(() => RunAssociationDemoForumModerationViewResult)
    async RunAssociationDemoForumModerationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumModerationViewResult)
    async RunAssociationDemoForumModerationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumModerationViewResult)
    async RunAssociationDemoForumModerationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Forum Moderations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoForumModeration_, { nullable: true })
    async AssociationDemoForumModeration(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumModeration_ | null> {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumModerations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Moderations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoForumModeration_)
    async CreateAssociationDemoForumModeration(
        @Arg('input', () => CreateAssociationDemoForumModerationInput) input: CreateAssociationDemoForumModerationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Forum Moderations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoForumModeration_)
    async UpdateAssociationDemoForumModeration(
        @Arg('input', () => UpdateAssociationDemoForumModerationInput) input: UpdateAssociationDemoForumModerationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Forum Moderations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoForumModeration_)
    async DeleteAssociationDemoForumModeration(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Forum Moderations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Forum Posts
//****************************************************************************
@ObjectType()
export class AssociationDemoForumPost_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ThreadID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentPostID?: string;
        
    @Field() 
    @MaxLength(16)
    AuthorID: string;
        
    @Field() 
    Content: string;
        
    @Field() 
    @MaxLength(8)
    PostedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    EditedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    EditedByID?: string;
        
    @Field(() => Int, {nullable: true}) 
    LikeCount?: number;
        
    @Field(() => Int, {nullable: true}) 
    HelpfulCount?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    IsAcceptedAnswer?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsFlagged?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    Status?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentPostID?: string;
        
    @Field(() => [AssociationDemoPostTag_])
    PostTags_PostIDArray: AssociationDemoPostTag_[]; // Link to PostTags
    
    @Field(() => [AssociationDemoPostReaction_])
    PostReactions_PostIDArray: AssociationDemoPostReaction_[]; // Link to PostReactions
    
    @Field(() => [AssociationDemoPostAttachment_])
    PostAttachments_PostIDArray: AssociationDemoPostAttachment_[]; // Link to PostAttachments
    
    @Field(() => [AssociationDemoForumModeration_])
    ForumModerations_PostIDArray: AssociationDemoForumModeration_[]; // Link to ForumModerations
    
    @Field(() => [AssociationDemoForumPost_])
    ForumPosts_ParentPostIDArray: AssociationDemoForumPost_[]; // Link to ForumPosts
    
}

//****************************************************************************
// INPUT TYPE for Forum Posts
//****************************************************************************
@InputType()
export class CreateAssociationDemoForumPostInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    ParentPostID: string | null;

    @Field({ nullable: true })
    AuthorID?: string;

    @Field({ nullable: true })
    Content?: string;

    @Field({ nullable: true })
    PostedDate?: Date;

    @Field({ nullable: true })
    EditedDate: Date | null;

    @Field({ nullable: true })
    EditedByID: string | null;

    @Field(() => Int, { nullable: true })
    LikeCount?: number | null;

    @Field(() => Int, { nullable: true })
    HelpfulCount?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsAcceptedAnswer?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsFlagged?: boolean | null;

    @Field({ nullable: true })
    Status?: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Forum Posts
//****************************************************************************
@InputType()
export class UpdateAssociationDemoForumPostInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    ParentPostID?: string | null;

    @Field({ nullable: true })
    AuthorID?: string;

    @Field({ nullable: true })
    Content?: string;

    @Field({ nullable: true })
    PostedDate?: Date;

    @Field({ nullable: true })
    EditedDate?: Date | null;

    @Field({ nullable: true })
    EditedByID?: string | null;

    @Field(() => Int, { nullable: true })
    LikeCount?: number | null;

    @Field(() => Int, { nullable: true })
    HelpfulCount?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsAcceptedAnswer?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsFlagged?: boolean | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Forum Posts
//****************************************************************************
@ObjectType()
export class RunAssociationDemoForumPostViewResult {
    @Field(() => [AssociationDemoForumPost_])
    Results: AssociationDemoForumPost_[];

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

@Resolver(AssociationDemoForumPost_)
export class AssociationDemoForumPostResolver extends ResolverBase {
    @Query(() => RunAssociationDemoForumPostViewResult)
    async RunAssociationDemoForumPostViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumPostViewResult)
    async RunAssociationDemoForumPostViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumPostViewResult)
    async RunAssociationDemoForumPostDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Forum Posts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoForumPost_, { nullable: true })
    async AssociationDemoForumPost(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumPost_ | null> {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumPosts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Posts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoPostTag_])
    async PostTags_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostTags] WHERE [PostID]='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostReaction_])
    async PostReactions_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Reactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostReactions] WHERE [PostID]='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Reactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Reactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostAttachment_])
    async PostAttachments_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostAttachments] WHERE [PostID]='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Attachments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumModeration_])
    async ForumModerations_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumModerations] WHERE [PostID]='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Moderations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumPost_])
    async ForumPosts_ParentPostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumPosts] WHERE [ParentPostID]='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoForumPost_)
    async CreateAssociationDemoForumPost(
        @Arg('input', () => CreateAssociationDemoForumPostInput) input: CreateAssociationDemoForumPostInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Forum Posts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoForumPost_)
    async UpdateAssociationDemoForumPost(
        @Arg('input', () => UpdateAssociationDemoForumPostInput) input: UpdateAssociationDemoForumPostInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Forum Posts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoForumPost_)
    async DeleteAssociationDemoForumPost(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Forum Posts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Forum Threads
//****************************************************************************
@ObjectType()
export class AssociationDemoForumThread_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    CategoryID: string;
        
    @Field() 
    @MaxLength(1000)
    Title: string;
        
    @Field() 
    @MaxLength(16)
    AuthorID: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field(() => Int, {nullable: true}) 
    ViewCount?: number;
        
    @Field(() => Int, {nullable: true}) 
    ReplyCount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    LastReplyAuthorID?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPinned?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsLocked?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsFeatured?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    Status?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Category: string;
        
    @Field(() => [AssociationDemoForumPost_])
    ForumPosts_ThreadIDArray: AssociationDemoForumPost_[]; // Link to ForumPosts
    
}

//****************************************************************************
// INPUT TYPE for Forum Threads
//****************************************************************************
@InputType()
export class CreateAssociationDemoForumThreadInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    AuthorID?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Int, { nullable: true })
    ViewCount?: number | null;

    @Field(() => Int, { nullable: true })
    ReplyCount?: number | null;

    @Field({ nullable: true })
    LastActivityDate: Date | null;

    @Field({ nullable: true })
    LastReplyAuthorID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPinned?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsLocked?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsFeatured?: boolean | null;

    @Field({ nullable: true })
    Status?: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Forum Threads
//****************************************************************************
@InputType()
export class UpdateAssociationDemoForumThreadInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    AuthorID?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Int, { nullable: true })
    ViewCount?: number | null;

    @Field(() => Int, { nullable: true })
    ReplyCount?: number | null;

    @Field({ nullable: true })
    LastActivityDate?: Date | null;

    @Field({ nullable: true })
    LastReplyAuthorID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPinned?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsLocked?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsFeatured?: boolean | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Forum Threads
//****************************************************************************
@ObjectType()
export class RunAssociationDemoForumThreadViewResult {
    @Field(() => [AssociationDemoForumThread_])
    Results: AssociationDemoForumThread_[];

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

@Resolver(AssociationDemoForumThread_)
export class AssociationDemoForumThreadResolver extends ResolverBase {
    @Query(() => RunAssociationDemoForumThreadViewResult)
    async RunAssociationDemoForumThreadViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumThreadViewResult)
    async RunAssociationDemoForumThreadViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoForumThreadViewResult)
    async RunAssociationDemoForumThreadDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Forum Threads';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoForumThread_, { nullable: true })
    async AssociationDemoForumThread(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumThread_ | null> {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumThreads] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Threads', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoForumPost_])
    async ForumPosts_ThreadIDArray(@Root() associationdemoforumthread_: AssociationDemoForumThread_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumPosts] WHERE [ThreadID]='${associationdemoforumthread_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoForumThread_)
    async CreateAssociationDemoForumThread(
        @Arg('input', () => CreateAssociationDemoForumThreadInput) input: CreateAssociationDemoForumThreadInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Forum Threads', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoForumThread_)
    async UpdateAssociationDemoForumThread(
        @Arg('input', () => UpdateAssociationDemoForumThreadInput) input: UpdateAssociationDemoForumThreadInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Forum Threads', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoForumThread_)
    async DeleteAssociationDemoForumThread(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Forum Threads', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Government Contacts
//****************************************************************************
@ObjectType()
export class AssociationDemoGovernmentContact_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    LegislativeBodyID?: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Title?: string;
        
    @Field() 
    @MaxLength(100)
    ContactType: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Party?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    District?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Committee?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    OfficeAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    TermStart?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    TermEnd?: Date;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    LegislativeBody?: string;
        
    @Field(() => [AssociationDemoAdvocacyAction_])
    AdvocacyActions_GovernmentContactIDArray: AssociationDemoAdvocacyAction_[]; // Link to AdvocacyActions
    
}

//****************************************************************************
// INPUT TYPE for Government Contacts
//****************************************************************************
@InputType()
export class CreateAssociationDemoGovernmentContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    LegislativeBodyID: string | null;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    ContactType?: string;

    @Field({ nullable: true })
    Party: string | null;

    @Field({ nullable: true })
    District: string | null;

    @Field({ nullable: true })
    Committee: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    OfficeAddress: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    TermStart: Date | null;

    @Field({ nullable: true })
    TermEnd: Date | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Government Contacts
//****************************************************************************
@InputType()
export class UpdateAssociationDemoGovernmentContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    LegislativeBodyID?: string | null;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    ContactType?: string;

    @Field({ nullable: true })
    Party?: string | null;

    @Field({ nullable: true })
    District?: string | null;

    @Field({ nullable: true })
    Committee?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    OfficeAddress?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    TermStart?: Date | null;

    @Field({ nullable: true })
    TermEnd?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Government Contacts
//****************************************************************************
@ObjectType()
export class RunAssociationDemoGovernmentContactViewResult {
    @Field(() => [AssociationDemoGovernmentContact_])
    Results: AssociationDemoGovernmentContact_[];

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

@Resolver(AssociationDemoGovernmentContact_)
export class AssociationDemoGovernmentContactResolver extends ResolverBase {
    @Query(() => RunAssociationDemoGovernmentContactViewResult)
    async RunAssociationDemoGovernmentContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoGovernmentContactViewResult)
    async RunAssociationDemoGovernmentContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoGovernmentContactViewResult)
    async RunAssociationDemoGovernmentContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Government Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoGovernmentContact_, { nullable: true })
    async AssociationDemoGovernmentContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoGovernmentContact_ | null> {
        this.CheckUserReadPermissions('Government Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwGovernmentContacts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Government Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Government Contacts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoAdvocacyAction_])
    async AdvocacyActions_GovernmentContactIDArray(@Root() associationdemogovernmentcontact_: AssociationDemoGovernmentContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwAdvocacyActions] WHERE [GovernmentContactID]='${associationdemogovernmentcontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Advocacy Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoGovernmentContact_)
    async CreateAssociationDemoGovernmentContact(
        @Arg('input', () => CreateAssociationDemoGovernmentContactInput) input: CreateAssociationDemoGovernmentContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Government Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoGovernmentContact_)
    async UpdateAssociationDemoGovernmentContact(
        @Arg('input', () => UpdateAssociationDemoGovernmentContactInput) input: UpdateAssociationDemoGovernmentContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Government Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoGovernmentContact_)
    async DeleteAssociationDemoGovernmentContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Government Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Invoice Line Items
//****************************************************************************
@ObjectType({ description: `Detailed line items for each invoice` })
export class AssociationDemoInvoiceLineItem_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Parent invoice`}) 
    @MaxLength(16)
    InvoiceID: string;
        
    @Field({description: `Line item description`}) 
    @MaxLength(1000)
    Description: string;
        
    @Field({description: `Type of item: Membership Dues, Event Registration, Course Enrollment, Merchandise, Donation, or Other`}) 
    @MaxLength(100)
    ItemType: string;
        
    @Field(() => Int, {nullable: true}) 
    Quantity?: number;
        
    @Field(() => Float) 
    UnitPrice: number;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field(() => Float, {nullable: true}) 
    TaxAmount?: number;
        
    @Field({nullable: true, description: `Related entity type (Event, Course, Membership, etc.)`}) 
    @MaxLength(200)
    RelatedEntityType?: string;
        
    @Field({nullable: true, description: `ID of related entity (EventID, CourseID, etc.)`}) 
    @MaxLength(16)
    RelatedEntityID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Invoice Line Items
//****************************************************************************
@InputType()
export class CreateAssociationDemoInvoiceLineItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    InvoiceID?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    ItemType?: string;

    @Field(() => Int, { nullable: true })
    Quantity?: number | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    TaxAmount?: number | null;

    @Field({ nullable: true })
    RelatedEntityType: string | null;

    @Field({ nullable: true })
    RelatedEntityID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Invoice Line Items
//****************************************************************************
@InputType()
export class UpdateAssociationDemoInvoiceLineItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    InvoiceID?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    ItemType?: string;

    @Field(() => Int, { nullable: true })
    Quantity?: number | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    TaxAmount?: number | null;

    @Field({ nullable: true })
    RelatedEntityType?: string | null;

    @Field({ nullable: true })
    RelatedEntityID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Invoice Line Items
//****************************************************************************
@ObjectType()
export class RunAssociationDemoInvoiceLineItemViewResult {
    @Field(() => [AssociationDemoInvoiceLineItem_])
    Results: AssociationDemoInvoiceLineItem_[];

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

@Resolver(AssociationDemoInvoiceLineItem_)
export class AssociationDemoInvoiceLineItemResolver extends ResolverBase {
    @Query(() => RunAssociationDemoInvoiceLineItemViewResult)
    async RunAssociationDemoInvoiceLineItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoInvoiceLineItemViewResult)
    async RunAssociationDemoInvoiceLineItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoInvoiceLineItemViewResult)
    async RunAssociationDemoInvoiceLineItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Invoice Line Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoInvoiceLineItem_, { nullable: true })
    async AssociationDemoInvoiceLineItem(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoInvoiceLineItem_ | null> {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwInvoiceLineItems] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Invoice Line Items', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoInvoiceLineItem_)
    async CreateAssociationDemoInvoiceLineItem(
        @Arg('input', () => CreateAssociationDemoInvoiceLineItemInput) input: CreateAssociationDemoInvoiceLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Invoice Line Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoInvoiceLineItem_)
    async UpdateAssociationDemoInvoiceLineItem(
        @Arg('input', () => UpdateAssociationDemoInvoiceLineItemInput) input: UpdateAssociationDemoInvoiceLineItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Invoice Line Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoInvoiceLineItem_)
    async DeleteAssociationDemoInvoiceLineItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Invoice Line Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Invoices
//****************************************************************************
@ObjectType({ description: `Invoices for membership dues, event registrations, course enrollments, and other charges` })
export class AssociationDemoInvoice_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Unique invoice number`}) 
    @MaxLength(100)
    InvoiceNumber: string;
        
    @Field({description: `Member being invoiced`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Date invoice was created`}) 
    @MaxLength(3)
    InvoiceDate: Date;
        
    @Field({description: `Payment due date`}) 
    @MaxLength(3)
    DueDate: Date;
        
    @Field(() => Float, {description: `Subtotal before tax and discounts`}) 
    SubTotal: number;
        
    @Field(() => Float, {nullable: true}) 
    Tax?: number;
        
    @Field(() => Float, {nullable: true}) 
    Discount?: number;
        
    @Field(() => Float, {description: `Total invoice amount`}) 
    Total: number;
        
    @Field(() => Float, {nullable: true, description: `Amount paid to date`}) 
    AmountPaid?: number;
        
    @Field(() => Float, {description: `Remaining balance due`}) 
    Balance: number;
        
    @Field({description: `Invoice status: Draft, Sent, Partial, Paid, Overdue, Cancelled, or Refunded`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentTerms?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoInvoiceLineItem_])
    InvoiceLineItems_InvoiceIDArray: AssociationDemoInvoiceLineItem_[]; // Link to InvoiceLineItems
    
    @Field(() => [AssociationDemoPayment_])
    Payments_InvoiceIDArray: AssociationDemoPayment_[]; // Link to Payments
    
}

//****************************************************************************
// INPUT TYPE for Invoices
//****************************************************************************
@InputType()
export class CreateAssociationDemoInvoiceInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    InvoiceNumber?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    InvoiceDate?: Date;

    @Field({ nullable: true })
    DueDate?: Date;

    @Field(() => Float, { nullable: true })
    SubTotal?: number;

    @Field(() => Float, { nullable: true })
    Tax?: number | null;

    @Field(() => Float, { nullable: true })
    Discount?: number | null;

    @Field(() => Float, { nullable: true })
    Total?: number;

    @Field(() => Float, { nullable: true })
    AmountPaid?: number | null;

    @Field(() => Float, { nullable: true })
    Balance?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    PaymentTerms: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Invoices
//****************************************************************************
@InputType()
export class UpdateAssociationDemoInvoiceInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    InvoiceNumber?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    InvoiceDate?: Date;

    @Field({ nullable: true })
    DueDate?: Date;

    @Field(() => Float, { nullable: true })
    SubTotal?: number;

    @Field(() => Float, { nullable: true })
    Tax?: number | null;

    @Field(() => Float, { nullable: true })
    Discount?: number | null;

    @Field(() => Float, { nullable: true })
    Total?: number;

    @Field(() => Float, { nullable: true })
    AmountPaid?: number | null;

    @Field(() => Float, { nullable: true })
    Balance?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    PaymentTerms?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Invoices
//****************************************************************************
@ObjectType()
export class RunAssociationDemoInvoiceViewResult {
    @Field(() => [AssociationDemoInvoice_])
    Results: AssociationDemoInvoice_[];

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

@Resolver(AssociationDemoInvoice_)
export class AssociationDemoInvoiceResolver extends ResolverBase {
    @Query(() => RunAssociationDemoInvoiceViewResult)
    async RunAssociationDemoInvoiceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoInvoiceViewResult)
    async RunAssociationDemoInvoiceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoInvoiceViewResult)
    async RunAssociationDemoInvoiceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Invoices';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoInvoice_, { nullable: true })
    async AssociationDemoInvoice(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoInvoice_ | null> {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwInvoices] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Invoices', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoInvoiceLineItem_])
    async InvoiceLineItems_InvoiceIDArray(@Root() associationdemoinvoice_: AssociationDemoInvoice_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwInvoiceLineItems] WHERE [InvoiceID]='${associationdemoinvoice_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Line Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPayment_])
    async Payments_InvoiceIDArray(@Root() associationdemoinvoice_: AssociationDemoInvoice_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPayments] WHERE [InvoiceID]='${associationdemoinvoice_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoInvoice_)
    async CreateAssociationDemoInvoice(
        @Arg('input', () => CreateAssociationDemoInvoiceInput) input: CreateAssociationDemoInvoiceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Invoices', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoInvoice_)
    async UpdateAssociationDemoInvoice(
        @Arg('input', () => UpdateAssociationDemoInvoiceInput) input: UpdateAssociationDemoInvoiceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Invoices', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoInvoice_)
    async DeleteAssociationDemoInvoice(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Invoices', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Legislative Bodies
//****************************************************************************
@ObjectType()
export class AssociationDemoLegislativeBody_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field() 
    @MaxLength(100)
    BodyType: string;
        
    @Field() 
    @MaxLength(40)
    Level: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    SessionSchedule?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoGovernmentContact_])
    GovernmentContacts_LegislativeBodyIDArray: AssociationDemoGovernmentContact_[]; // Link to GovernmentContacts
    
    @Field(() => [AssociationDemoLegislativeIssue_])
    LegislativeIssues_LegislativeBodyIDArray: AssociationDemoLegislativeIssue_[]; // Link to LegislativeIssues
    
}

//****************************************************************************
// INPUT TYPE for Legislative Bodies
//****************************************************************************
@InputType()
export class CreateAssociationDemoLegislativeBodyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    BodyType?: string;

    @Field({ nullable: true })
    Level?: string;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    SessionSchedule: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Legislative Bodies
//****************************************************************************
@InputType()
export class UpdateAssociationDemoLegislativeBodyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    BodyType?: string;

    @Field({ nullable: true })
    Level?: string;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    SessionSchedule?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Legislative Bodies
//****************************************************************************
@ObjectType()
export class RunAssociationDemoLegislativeBodyViewResult {
    @Field(() => [AssociationDemoLegislativeBody_])
    Results: AssociationDemoLegislativeBody_[];

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

@Resolver(AssociationDemoLegislativeBody_)
export class AssociationDemoLegislativeBodyResolver extends ResolverBase {
    @Query(() => RunAssociationDemoLegislativeBodyViewResult)
    async RunAssociationDemoLegislativeBodyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoLegislativeBodyViewResult)
    async RunAssociationDemoLegislativeBodyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoLegislativeBodyViewResult)
    async RunAssociationDemoLegislativeBodyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Legislative Bodies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoLegislativeBody_, { nullable: true })
    async AssociationDemoLegislativeBody(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoLegislativeBody_ | null> {
        this.CheckUserReadPermissions('Legislative Bodies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwLegislativeBodies] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Legislative Bodies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Legislative Bodies', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoGovernmentContact_])
    async GovernmentContacts_LegislativeBodyIDArray(@Root() associationdemolegislativebody_: AssociationDemoLegislativeBody_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Government Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwGovernmentContacts] WHERE [LegislativeBodyID]='${associationdemolegislativebody_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Government Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Government Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoLegislativeIssue_])
    async LegislativeIssues_LegislativeBodyIDArray(@Root() associationdemolegislativebody_: AssociationDemoLegislativeBody_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Legislative Issues', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwLegislativeIssues] WHERE [LegislativeBodyID]='${associationdemolegislativebody_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Legislative Issues', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Legislative Issues', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoLegislativeBody_)
    async CreateAssociationDemoLegislativeBody(
        @Arg('input', () => CreateAssociationDemoLegislativeBodyInput) input: CreateAssociationDemoLegislativeBodyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Legislative Bodies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoLegislativeBody_)
    async UpdateAssociationDemoLegislativeBody(
        @Arg('input', () => UpdateAssociationDemoLegislativeBodyInput) input: UpdateAssociationDemoLegislativeBodyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Legislative Bodies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoLegislativeBody_)
    async DeleteAssociationDemoLegislativeBody(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Legislative Bodies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Legislative Issues
//****************************************************************************
@ObjectType()
export class AssociationDemoLegislativeIssue_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    LegislativeBodyID: string;
        
    @Field() 
    @MaxLength(1000)
    Title: string;
        
    @Field() 
    @MaxLength(100)
    IssueType: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    BillNumber?: string;
        
    @Field() 
    @MaxLength(100)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    IntroducedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    LastActionDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    EffectiveDate?: Date;
        
    @Field({nullable: true}) 
    Summary?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ImpactLevel?: string;
        
    @Field({nullable: true}) 
    ImpactDescription?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Sponsor?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    TrackingURL?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    LegislativeBody: string;
        
    @Field(() => [AssociationDemoPolicyPosition_])
    PolicyPositions_LegislativeIssueIDArray: AssociationDemoPolicyPosition_[]; // Link to PolicyPositions
    
    @Field(() => [AssociationDemoRegulatoryComment_])
    RegulatoryComments_LegislativeIssueIDArray: AssociationDemoRegulatoryComment_[]; // Link to RegulatoryComments
    
    @Field(() => [AssociationDemoAdvocacyAction_])
    AdvocacyActions_LegislativeIssueIDArray: AssociationDemoAdvocacyAction_[]; // Link to AdvocacyActions
    
}

//****************************************************************************
// INPUT TYPE for Legislative Issues
//****************************************************************************
@InputType()
export class CreateAssociationDemoLegislativeIssueInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    LegislativeBodyID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    IssueType?: string;

    @Field({ nullable: true })
    BillNumber: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    IntroducedDate: Date | null;

    @Field({ nullable: true })
    LastActionDate: Date | null;

    @Field({ nullable: true })
    EffectiveDate: Date | null;

    @Field({ nullable: true })
    Summary: string | null;

    @Field({ nullable: true })
    ImpactLevel: string | null;

    @Field({ nullable: true })
    ImpactDescription: string | null;

    @Field({ nullable: true })
    Category: string | null;

    @Field({ nullable: true })
    Sponsor: string | null;

    @Field({ nullable: true })
    TrackingURL: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Legislative Issues
//****************************************************************************
@InputType()
export class UpdateAssociationDemoLegislativeIssueInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    LegislativeBodyID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    IssueType?: string;

    @Field({ nullable: true })
    BillNumber?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    IntroducedDate?: Date | null;

    @Field({ nullable: true })
    LastActionDate?: Date | null;

    @Field({ nullable: true })
    EffectiveDate?: Date | null;

    @Field({ nullable: true })
    Summary?: string | null;

    @Field({ nullable: true })
    ImpactLevel?: string | null;

    @Field({ nullable: true })
    ImpactDescription?: string | null;

    @Field({ nullable: true })
    Category?: string | null;

    @Field({ nullable: true })
    Sponsor?: string | null;

    @Field({ nullable: true })
    TrackingURL?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Legislative Issues
//****************************************************************************
@ObjectType()
export class RunAssociationDemoLegislativeIssueViewResult {
    @Field(() => [AssociationDemoLegislativeIssue_])
    Results: AssociationDemoLegislativeIssue_[];

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

@Resolver(AssociationDemoLegislativeIssue_)
export class AssociationDemoLegislativeIssueResolver extends ResolverBase {
    @Query(() => RunAssociationDemoLegislativeIssueViewResult)
    async RunAssociationDemoLegislativeIssueViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoLegislativeIssueViewResult)
    async RunAssociationDemoLegislativeIssueViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoLegislativeIssueViewResult)
    async RunAssociationDemoLegislativeIssueDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Legislative Issues';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoLegislativeIssue_, { nullable: true })
    async AssociationDemoLegislativeIssue(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoLegislativeIssue_ | null> {
        this.CheckUserReadPermissions('Legislative Issues', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwLegislativeIssues] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Legislative Issues', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Legislative Issues', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoPolicyPosition_])
    async PolicyPositions_LegislativeIssueIDArray(@Root() associationdemolegislativeissue_: AssociationDemoLegislativeIssue_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Policy Positions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPolicyPositions] WHERE [LegislativeIssueID]='${associationdemolegislativeissue_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Policy Positions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Policy Positions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoRegulatoryComment_])
    async RegulatoryComments_LegislativeIssueIDArray(@Root() associationdemolegislativeissue_: AssociationDemoLegislativeIssue_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Regulatory Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwRegulatoryComments] WHERE [LegislativeIssueID]='${associationdemolegislativeissue_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Regulatory Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Regulatory Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoAdvocacyAction_])
    async AdvocacyActions_LegislativeIssueIDArray(@Root() associationdemolegislativeissue_: AssociationDemoLegislativeIssue_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwAdvocacyActions] WHERE [LegislativeIssueID]='${associationdemolegislativeissue_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Advocacy Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoLegislativeIssue_)
    async CreateAssociationDemoLegislativeIssue(
        @Arg('input', () => CreateAssociationDemoLegislativeIssueInput) input: CreateAssociationDemoLegislativeIssueInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Legislative Issues', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoLegislativeIssue_)
    async UpdateAssociationDemoLegislativeIssue(
        @Arg('input', () => UpdateAssociationDemoLegislativeIssueInput) input: UpdateAssociationDemoLegislativeIssueInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Legislative Issues', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoLegislativeIssue_)
    async DeleteAssociationDemoLegislativeIssue(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Legislative Issues', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Follows
//****************************************************************************
@ObjectType()
export class AssociationDemoMemberFollow_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    FollowerID: string;
        
    @Field() 
    @MaxLength(100)
    FollowType: string;
        
    @Field() 
    @MaxLength(16)
    FollowedEntityID: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NotifyOnActivity?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Member Follows
//****************************************************************************
@InputType()
export class CreateAssociationDemoMemberFollowInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FollowerID?: string;

    @Field({ nullable: true })
    FollowType?: string;

    @Field({ nullable: true })
    FollowedEntityID?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Boolean, { nullable: true })
    NotifyOnActivity?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Follows
//****************************************************************************
@InputType()
export class UpdateAssociationDemoMemberFollowInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FollowerID?: string;

    @Field({ nullable: true })
    FollowType?: string;

    @Field({ nullable: true })
    FollowedEntityID?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Boolean, { nullable: true })
    NotifyOnActivity?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Follows
//****************************************************************************
@ObjectType()
export class RunAssociationDemoMemberFollowViewResult {
    @Field(() => [AssociationDemoMemberFollow_])
    Results: AssociationDemoMemberFollow_[];

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

@Resolver(AssociationDemoMemberFollow_)
export class AssociationDemoMemberFollowResolver extends ResolverBase {
    @Query(() => RunAssociationDemoMemberFollowViewResult)
    async RunAssociationDemoMemberFollowViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMemberFollowViewResult)
    async RunAssociationDemoMemberFollowViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMemberFollowViewResult)
    async RunAssociationDemoMemberFollowDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Follows';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoMemberFollow_, { nullable: true })
    async AssociationDemoMemberFollow(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMemberFollow_ | null> {
        this.CheckUserReadPermissions('Member Follows', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMemberFollows] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Follows', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Follows', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoMemberFollow_)
    async CreateAssociationDemoMemberFollow(
        @Arg('input', () => CreateAssociationDemoMemberFollowInput) input: CreateAssociationDemoMemberFollowInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Follows', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoMemberFollow_)
    async UpdateAssociationDemoMemberFollow(
        @Arg('input', () => UpdateAssociationDemoMemberFollowInput) input: UpdateAssociationDemoMemberFollowInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Follows', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoMemberFollow_)
    async DeleteAssociationDemoMemberFollow(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Member Follows', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Members
//****************************************************************************
@ObjectType({ description: `Individual members of the association` })
export class AssociationDemoMember_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Primary email address (unique)`}) 
    @MaxLength(510)
    Email: string;
        
    @Field({description: `Member first name`}) 
    @MaxLength(200)
    FirstName: string;
        
    @Field({description: `Member last name`}) 
    @MaxLength(200)
    LastName: string;
        
    @Field({nullable: true, description: `Job title`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `Associated organization (if applicable)`}) 
    @MaxLength(16)
    OrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    JobFunction?: string;
        
    @Field(() => Int, {nullable: true}) 
    YearsInProfession?: number;
        
    @Field({description: `Date member joined the association`}) 
    @MaxLength(3)
    JoinDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    LinkedInURL?: string;
        
    @Field({nullable: true}) 
    Bio?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    PreferredLanguage?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Timezone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Mobile?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    PostalCode?: string;
        
    @Field(() => Int, {nullable: true, description: `Calculated engagement score based on activity`}) 
    EngagementScore?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    ProfilePhotoURL?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Organization?: string;
        
    @Field(() => [AssociationDemoResourceVersion_])
    ResourceVersions_CreatedByIDArray: AssociationDemoResourceVersion_[]; // Link to ResourceVersions
    
    @Field(() => [AssociationDemoInvoice_])
    Invoices_MemberIDArray: AssociationDemoInvoice_[]; // Link to Invoices
    
    @Field(() => [AssociationDemoPostReaction_])
    PostReactions_MemberIDArray: AssociationDemoPostReaction_[]; // Link to PostReactions
    
    @Field(() => [AssociationDemoCommittee_])
    Committees_ChairMemberIDArray: AssociationDemoCommittee_[]; // Link to Committees
    
    @Field(() => [AssociationDemoBoardMember_])
    BoardMembers_MemberIDArray: AssociationDemoBoardMember_[]; // Link to BoardMembers
    
    @Field(() => [AssociationDemoForumCategory_])
    ForumCategories_LastPostAuthorIDArray: AssociationDemoForumCategory_[]; // Link to ForumCategories
    
    @Field(() => [AssociationDemoForumThread_])
    ForumThreads_LastReplyAuthorIDArray: AssociationDemoForumThread_[]; // Link to ForumThreads
    
    @Field(() => [AssociationDemoForumModeration_])
    ForumModerations_ModeratedByIDArray: AssociationDemoForumModeration_[]; // Link to ForumModerations
    
    @Field(() => [AssociationDemoResource_])
    Resources_AuthorIDArray: AssociationDemoResource_[]; // Link to Resources
    
    @Field(() => [AssociationDemoCertification_])
    Certifications_MemberIDArray: AssociationDemoCertification_[]; // Link to Certifications
    
    @Field(() => [AssociationDemoContinuingEducation_])
    ContinuingEducations_MemberIDArray: AssociationDemoContinuingEducation_[]; // Link to ContinuingEducations
    
    @Field(() => [AssociationDemoResourceDownload_])
    ResourceDownloads_MemberIDArray: AssociationDemoResourceDownload_[]; // Link to ResourceDownloads
    
    @Field(() => [AssociationDemoMembership_])
    Memberships_MemberIDArray: AssociationDemoMembership_[]; // Link to Memberships
    
    @Field(() => [AssociationDemoForumPost_])
    ForumPosts_EditedByIDArray: AssociationDemoForumPost_[]; // Link to ForumPosts
    
    @Field(() => [AssociationDemoResourceRating_])
    ResourceRatings_MemberIDArray: AssociationDemoResourceRating_[]; // Link to ResourceRatings
    
    @Field(() => [AssociationDemoPostAttachment_])
    PostAttachments_UploadedByIDArray: AssociationDemoPostAttachment_[]; // Link to PostAttachments
    
    @Field(() => [AssociationDemoEventRegistration_])
    EventRegistrations_MemberIDArray: AssociationDemoEventRegistration_[]; // Link to EventRegistrations
    
    @Field(() => [AssociationDemoProduct_])
    Products_MemberIDArray: AssociationDemoProduct_[]; // Link to Products
    
    @Field(() => [AssociationDemoMemberFollow_])
    MemberFollows_FollowerIDArray: AssociationDemoMemberFollow_[]; // Link to MemberFollows
    
    @Field(() => [AssociationDemoCompetitionJudge_])
    CompetitionJudges_MemberIDArray: AssociationDemoCompetitionJudge_[]; // Link to CompetitionJudges
    
    @Field(() => [AssociationDemoForumPost_])
    ForumPosts_AuthorIDArray: AssociationDemoForumPost_[]; // Link to ForumPosts
    
    @Field(() => [AssociationDemoCampaignMember_])
    CampaignMembers_MemberIDArray: AssociationDemoCampaignMember_[]; // Link to CampaignMembers
    
    @Field(() => [AssociationDemoEnrollment_])
    Enrollments_MemberIDArray: AssociationDemoEnrollment_[]; // Link to Enrollments
    
    @Field(() => [AssociationDemoForumThread_])
    ForumThreads_AuthorIDArray: AssociationDemoForumThread_[]; // Link to ForumThreads
    
    @Field(() => [AssociationDemoForumModeration_])
    ForumModerations_ReportedByIDArray: AssociationDemoForumModeration_[]; // Link to ForumModerations
    
    @Field(() => [AssociationDemoChapterMembership_])
    ChapterMemberships_MemberIDArray: AssociationDemoChapterMembership_[]; // Link to ChapterMemberships
    
    @Field(() => [AssociationDemoCommitteeMembership_])
    CommitteeMemberships_MemberIDArray: AssociationDemoCommitteeMembership_[]; // Link to CommitteeMemberships
    
    @Field(() => [AssociationDemoChapterOfficer_])
    ChapterOfficers_MemberIDArray: AssociationDemoChapterOfficer_[]; // Link to ChapterOfficers
    
    @Field(() => [AssociationDemoAdvocacyAction_])
    AdvocacyActions_MemberIDArray: AssociationDemoAdvocacyAction_[]; // Link to AdvocacyActions
    
    @Field(() => [AssociationDemoEmailSend_])
    EmailSends_MemberIDArray: AssociationDemoEmailSend_[]; // Link to EmailSends
    
}

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class CreateAssociationDemoMemberInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    OrganizationID: string | null;

    @Field({ nullable: true })
    Industry: string | null;

    @Field({ nullable: true })
    JobFunction: string | null;

    @Field(() => Int, { nullable: true })
    YearsInProfession: number | null;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field({ nullable: true })
    LinkedInURL: string | null;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    PreferredLanguage?: string | null;

    @Field({ nullable: true })
    Timezone: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Mobile: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field(() => Int, { nullable: true })
    EngagementScore?: number | null;

    @Field({ nullable: true })
    LastActivityDate: Date | null;

    @Field({ nullable: true })
    ProfilePhotoURL: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class UpdateAssociationDemoMemberInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    OrganizationID?: string | null;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field({ nullable: true })
    JobFunction?: string | null;

    @Field(() => Int, { nullable: true })
    YearsInProfession?: number | null;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field({ nullable: true })
    LinkedInURL?: string | null;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    PreferredLanguage?: string | null;

    @Field({ nullable: true })
    Timezone?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Mobile?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field(() => Int, { nullable: true })
    EngagementScore?: number | null;

    @Field({ nullable: true })
    LastActivityDate?: Date | null;

    @Field({ nullable: true })
    ProfilePhotoURL?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Members
//****************************************************************************
@ObjectType()
export class RunAssociationDemoMemberViewResult {
    @Field(() => [AssociationDemoMember_])
    Results: AssociationDemoMember_[];

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

@Resolver(AssociationDemoMember_)
export class AssociationDemoMemberResolver extends ResolverBase {
    @Query(() => RunAssociationDemoMemberViewResult)
    async RunAssociationDemoMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMemberViewResult)
    async RunAssociationDemoMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMemberViewResult)
    async RunAssociationDemoMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoMember_, { nullable: true })
    async AssociationDemoMember(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMember_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMembers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Members', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoResourceVersion_])
    async ResourceVersions_CreatedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceVersions] WHERE [CreatedByID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Versions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoInvoice_])
    async Invoices_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwInvoices] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoices', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostReaction_])
    async PostReactions_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Reactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostReactions] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Reactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Reactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCommittee_])
    async Committees_ChairMemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCommittees] WHERE [ChairMemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoBoardMember_])
    async BoardMembers_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Board Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwBoardMembers] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Board Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumCategory_])
    async ForumCategories_LastPostAuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumCategories] WHERE [LastPostAuthorID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumThread_])
    async ForumThreads_LastReplyAuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumThreads] WHERE [LastReplyAuthorID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Threads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumModeration_])
    async ForumModerations_ModeratedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumModerations] WHERE [ModeratedByID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Moderations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResource_])
    async Resources_AuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resources', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResources] WHERE [AuthorID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resources', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resources', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCertification_])
    async Certifications_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCertifications] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certifications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoContinuingEducation_])
    async ContinuingEducations_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Continuing Educations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwContinuingEducations] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Continuing Educations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Continuing Educations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceDownload_])
    async ResourceDownloads_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Downloads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceDownloads] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Downloads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Downloads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoMembership_])
    async Memberships_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMemberships] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumPost_])
    async ForumPosts_EditedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumPosts] WHERE [EditedByID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceRating_])
    async ResourceRatings_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Ratings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceRatings] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Ratings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Ratings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostAttachment_])
    async PostAttachments_UploadedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostAttachments] WHERE [UploadedByID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Attachments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEventRegistration_])
    async EventRegistrations_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEventRegistrations] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProduct_])
    async Products_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProducts] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoMemberFollow_])
    async MemberFollows_FollowerIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Follows', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMemberFollows] WHERE [FollowerID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Follows', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Follows', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCompetitionJudge_])
    async CompetitionJudges_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Judges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionJudges] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Judges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Judges', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumPost_])
    async ForumPosts_AuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumPosts] WHERE [AuthorID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCampaignMember_])
    async CampaignMembers_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCampaignMembers] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Campaign Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEnrollment_])
    async Enrollments_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Enrollments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEnrollments] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Enrollments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Enrollments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumThread_])
    async ForumThreads_AuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumThreads] WHERE [AuthorID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Threads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumModeration_])
    async ForumModerations_ReportedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwForumModerations] WHERE [ReportedByID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Moderations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoChapterMembership_])
    async ChapterMemberships_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapterMemberships] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCommitteeMembership_])
    async CommitteeMemberships_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCommitteeMemberships] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committee Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoChapterOfficer_])
    async ChapterOfficers_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Officers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwChapterOfficers] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Officers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Officers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoAdvocacyAction_])
    async AdvocacyActions_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwAdvocacyActions] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Advocacy Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEmailSend_])
    async EmailSends_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwEmailSends] WHERE [MemberID]='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Sends', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoMember_)
    async CreateAssociationDemoMember(
        @Arg('input', () => CreateAssociationDemoMemberInput) input: CreateAssociationDemoMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoMember_)
    async UpdateAssociationDemoMember(
        @Arg('input', () => UpdateAssociationDemoMemberInput) input: UpdateAssociationDemoMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoMember_)
    async DeleteAssociationDemoMember(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Members', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Membership Types
//****************************************************************************
@ObjectType({ description: `Types of memberships offered by the association` })
export class AssociationDemoMembershipType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Name of membership type (e.g., Individual, Corporate, Student)`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Float, {description: `Annual membership dues amount`}) 
    AnnualDues: number;
        
    @Field(() => Int, {description: `Number of months until renewal (typically 12)`}) 
    RenewalPeriodMonths: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field(() => Boolean, {description: `Whether members can set up automatic renewal`}) 
    AllowAutoRenew: boolean;
        
    @Field(() => Boolean, {description: `Whether membership requires staff approval`}) 
    RequiresApproval: boolean;
        
    @Field({nullable: true}) 
    Benefits?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoMembership_])
    Memberships_MembershipTypeIDArray: AssociationDemoMembership_[]; // Link to Memberships
    
}

//****************************************************************************
// INPUT TYPE for Membership Types
//****************************************************************************
@InputType()
export class CreateAssociationDemoMembershipTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    AnnualDues?: number;

    @Field(() => Int, { nullable: true })
    RenewalPeriodMonths?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => Boolean, { nullable: true })
    AllowAutoRenew?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresApproval?: boolean;

    @Field({ nullable: true })
    Benefits: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Membership Types
//****************************************************************************
@InputType()
export class UpdateAssociationDemoMembershipTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    AnnualDues?: number;

    @Field(() => Int, { nullable: true })
    RenewalPeriodMonths?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => Boolean, { nullable: true })
    AllowAutoRenew?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresApproval?: boolean;

    @Field({ nullable: true })
    Benefits?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Membership Types
//****************************************************************************
@ObjectType()
export class RunAssociationDemoMembershipTypeViewResult {
    @Field(() => [AssociationDemoMembershipType_])
    Results: AssociationDemoMembershipType_[];

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

@Resolver(AssociationDemoMembershipType_)
export class AssociationDemoMembershipTypeResolver extends ResolverBase {
    @Query(() => RunAssociationDemoMembershipTypeViewResult)
    async RunAssociationDemoMembershipTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMembershipTypeViewResult)
    async RunAssociationDemoMembershipTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMembershipTypeViewResult)
    async RunAssociationDemoMembershipTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Membership Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoMembershipType_, { nullable: true })
    async AssociationDemoMembershipType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMembershipType_ | null> {
        this.CheckUserReadPermissions('Membership Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMembershipTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Membership Types', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoMembership_])
    async Memberships_MembershipTypeIDArray(@Root() associationdemomembershiptype_: AssociationDemoMembershipType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMemberships] WHERE [MembershipTypeID]='${associationdemomembershiptype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoMembershipType_)
    async CreateAssociationDemoMembershipType(
        @Arg('input', () => CreateAssociationDemoMembershipTypeInput) input: CreateAssociationDemoMembershipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Membership Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoMembershipType_)
    async UpdateAssociationDemoMembershipType(
        @Arg('input', () => UpdateAssociationDemoMembershipTypeInput) input: UpdateAssociationDemoMembershipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Membership Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoMembershipType_)
    async DeleteAssociationDemoMembershipType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Membership Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Memberships
//****************************************************************************
@ObjectType({ description: `Membership records tracking member subscriptions and renewals` })
export class AssociationDemoMembership_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Member who holds this membership`}) 
    @MaxLength(16)
    MemberID: string;
        
    @Field({description: `Type of membership`}) 
    @MaxLength(16)
    MembershipTypeID: string;
        
    @Field({description: `Current status: Active, Pending, Lapsed, Suspended, or Cancelled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({description: `Membership start date`}) 
    @MaxLength(3)
    StartDate: Date;
        
    @Field({description: `Membership end/expiration date`}) 
    @MaxLength(3)
    EndDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    RenewalDate?: Date;
        
    @Field(() => Boolean, {description: `Whether membership will automatically renew`}) 
    AutoRenew: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    CancellationDate?: Date;
        
    @Field({nullable: true}) 
    CancellationReason?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    MembershipType: string;
        
}

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class CreateAssociationDemoMembershipInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    MembershipTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    RenewalDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    AutoRenew?: boolean;

    @Field({ nullable: true })
    CancellationDate: Date | null;

    @Field({ nullable: true })
    CancellationReason: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class UpdateAssociationDemoMembershipInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    MembershipTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    RenewalDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    AutoRenew?: boolean;

    @Field({ nullable: true })
    CancellationDate?: Date | null;

    @Field({ nullable: true })
    CancellationReason?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Memberships
//****************************************************************************
@ObjectType()
export class RunAssociationDemoMembershipViewResult {
    @Field(() => [AssociationDemoMembership_])
    Results: AssociationDemoMembership_[];

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

@Resolver(AssociationDemoMembership_)
export class AssociationDemoMembershipResolver extends ResolverBase {
    @Query(() => RunAssociationDemoMembershipViewResult)
    async RunAssociationDemoMembershipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMembershipViewResult)
    async RunAssociationDemoMembershipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoMembershipViewResult)
    async RunAssociationDemoMembershipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoMembership_, { nullable: true })
    async AssociationDemoMembership(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMembership_ | null> {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMemberships] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Memberships', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoMembership_)
    async CreateAssociationDemoMembership(
        @Arg('input', () => CreateAssociationDemoMembershipInput) input: CreateAssociationDemoMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoMembership_)
    async UpdateAssociationDemoMembership(
        @Arg('input', () => UpdateAssociationDemoMembershipInput) input: UpdateAssociationDemoMembershipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoMembership_)
    async DeleteAssociationDemoMembership(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organizations
//****************************************************************************
@ObjectType({ description: `Organizations and companies that are associated with the association` })
export class AssociationDemoOrganization_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Company or organization name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: `Primary industry or sector`}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of employees`}) 
    EmployeeCount?: number;
        
    @Field(() => Float, {nullable: true, description: `Annual revenue in USD`}) 
    AnnualRevenue?: number;
        
    @Field(() => Float, {nullable: true, description: `Market capitalization in USD (for public companies)`}) 
    MarketCapitalization?: number;
        
    @Field({nullable: true, description: `Stock ticker symbol (for public companies)`}) 
    @MaxLength(20)
    TickerSymbol?: string;
        
    @Field({nullable: true, description: `Stock exchange (NYSE, NASDAQ, etc. for public companies)`}) 
    @MaxLength(100)
    Exchange?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Int, {nullable: true}) 
    YearFounded?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    PostalCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    LogoURL?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoMember_])
    Members_OrganizationIDArray: AssociationDemoMember_[]; // Link to Members
    
}

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class CreateAssociationDemoOrganizationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Industry: string | null;

    @Field(() => Int, { nullable: true })
    EmployeeCount: number | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue: number | null;

    @Field(() => Float, { nullable: true })
    MarketCapitalization: number | null;

    @Field({ nullable: true })
    TickerSymbol: string | null;

    @Field({ nullable: true })
    Exchange: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    YearFounded: number | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    LogoURL: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class UpdateAssociationDemoOrganizationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field(() => Int, { nullable: true })
    EmployeeCount?: number | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue?: number | null;

    @Field(() => Float, { nullable: true })
    MarketCapitalization?: number | null;

    @Field({ nullable: true })
    TickerSymbol?: string | null;

    @Field({ nullable: true })
    Exchange?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    YearFounded?: number | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    LogoURL?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organizations
//****************************************************************************
@ObjectType()
export class RunAssociationDemoOrganizationViewResult {
    @Field(() => [AssociationDemoOrganization_])
    Results: AssociationDemoOrganization_[];

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

@Resolver(AssociationDemoOrganization_)
export class AssociationDemoOrganizationResolver extends ResolverBase {
    @Query(() => RunAssociationDemoOrganizationViewResult)
    async RunAssociationDemoOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoOrganizationViewResult)
    async RunAssociationDemoOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoOrganizationViewResult)
    async RunAssociationDemoOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoOrganization_, { nullable: true })
    async AssociationDemoOrganization(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoOrganization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwOrganizations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organizations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoMember_])
    async Members_OrganizationIDArray(@Root() associationdemoorganization_: AssociationDemoOrganization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwMembers] WHERE [OrganizationID]='${associationdemoorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoOrganization_)
    async CreateAssociationDemoOrganization(
        @Arg('input', () => CreateAssociationDemoOrganizationInput) input: CreateAssociationDemoOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoOrganization_)
    async UpdateAssociationDemoOrganization(
        @Arg('input', () => UpdateAssociationDemoOrganizationInput) input: UpdateAssociationDemoOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoOrganization_)
    async DeleteAssociationDemoOrganization(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payments
//****************************************************************************
@ObjectType({ description: `Payment transactions for invoices` })
export class AssociationDemoPayment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Invoice being paid`}) 
    @MaxLength(16)
    InvoiceID: string;
        
    @Field({description: `Date payment was initiated`}) 
    @MaxLength(8)
    PaymentDate: Date;
        
    @Field(() => Float, {description: `Payment amount`}) 
    Amount: number;
        
    @Field({description: `Payment method: Credit Card, ACH, Check, Wire, PayPal, Stripe, or Cash`}) 
    @MaxLength(100)
    PaymentMethod: string;
        
    @Field({nullable: true, description: `External payment provider transaction ID`}) 
    @MaxLength(510)
    TransactionID?: string;
        
    @Field({description: `Payment status: Pending, Completed, Failed, Refunded, or Cancelled`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ProcessedDate?: Date;
        
    @Field({nullable: true}) 
    FailureReason?: string;
        
    @Field({nullable: true}) 
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
export class CreateAssociationDemoPaymentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    InvoiceID?: string;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field({ nullable: true })
    TransactionID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ProcessedDate: Date | null;

    @Field({ nullable: true })
    FailureReason: string | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Payments
//****************************************************************************
@InputType()
export class UpdateAssociationDemoPaymentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    InvoiceID?: string;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field({ nullable: true })
    TransactionID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ProcessedDate?: Date | null;

    @Field({ nullable: true })
    FailureReason?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payments
//****************************************************************************
@ObjectType()
export class RunAssociationDemoPaymentViewResult {
    @Field(() => [AssociationDemoPayment_])
    Results: AssociationDemoPayment_[];

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

@Resolver(AssociationDemoPayment_)
export class AssociationDemoPaymentResolver extends ResolverBase {
    @Query(() => RunAssociationDemoPaymentViewResult)
    async RunAssociationDemoPaymentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPaymentViewResult)
    async RunAssociationDemoPaymentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPaymentViewResult)
    async RunAssociationDemoPaymentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoPayment_, { nullable: true })
    async AssociationDemoPayment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPayment_ | null> {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPayments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Payments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoPayment_)
    async CreateAssociationDemoPayment(
        @Arg('input', () => CreateAssociationDemoPaymentInput) input: CreateAssociationDemoPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoPayment_)
    async UpdateAssociationDemoPayment(
        @Arg('input', () => UpdateAssociationDemoPaymentInput) input: UpdateAssociationDemoPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoPayment_)
    async DeleteAssociationDemoPayment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Payments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Policy Positions
//****************************************************************************
@ObjectType()
export class AssociationDemoPolicyPosition_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    LegislativeIssueID: string;
        
    @Field() 
    @MaxLength(60)
    Position: string;
        
    @Field() 
    PositionStatement: string;
        
    @Field({nullable: true}) 
    Rationale?: string;
        
    @Field() 
    @MaxLength(3)
    AdoptedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    AdoptedBy?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    ExpirationDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    Priority?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPublic?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    DocumentURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ContactPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    LastReviewedDate?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Policy Positions
//****************************************************************************
@InputType()
export class CreateAssociationDemoPolicyPositionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    LegislativeIssueID?: string;

    @Field({ nullable: true })
    Position?: string;

    @Field({ nullable: true })
    PositionStatement?: string;

    @Field({ nullable: true })
    Rationale: string | null;

    @Field({ nullable: true })
    AdoptedDate?: Date;

    @Field({ nullable: true })
    AdoptedBy: string | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    Priority: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPublic?: boolean | null;

    @Field({ nullable: true })
    DocumentURL: string | null;

    @Field({ nullable: true })
    ContactPerson: string | null;

    @Field({ nullable: true })
    LastReviewedDate: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Policy Positions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoPolicyPositionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    LegislativeIssueID?: string;

    @Field({ nullable: true })
    Position?: string;

    @Field({ nullable: true })
    PositionStatement?: string;

    @Field({ nullable: true })
    Rationale?: string | null;

    @Field({ nullable: true })
    AdoptedDate?: Date;

    @Field({ nullable: true })
    AdoptedBy?: string | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    Priority?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPublic?: boolean | null;

    @Field({ nullable: true })
    DocumentURL?: string | null;

    @Field({ nullable: true })
    ContactPerson?: string | null;

    @Field({ nullable: true })
    LastReviewedDate?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Policy Positions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoPolicyPositionViewResult {
    @Field(() => [AssociationDemoPolicyPosition_])
    Results: AssociationDemoPolicyPosition_[];

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

@Resolver(AssociationDemoPolicyPosition_)
export class AssociationDemoPolicyPositionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoPolicyPositionViewResult)
    async RunAssociationDemoPolicyPositionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPolicyPositionViewResult)
    async RunAssociationDemoPolicyPositionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPolicyPositionViewResult)
    async RunAssociationDemoPolicyPositionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Policy Positions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoPolicyPosition_, { nullable: true })
    async AssociationDemoPolicyPosition(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPolicyPosition_ | null> {
        this.CheckUserReadPermissions('Policy Positions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPolicyPositions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Policy Positions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Policy Positions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoPolicyPosition_)
    async CreateAssociationDemoPolicyPosition(
        @Arg('input', () => CreateAssociationDemoPolicyPositionInput) input: CreateAssociationDemoPolicyPositionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Policy Positions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoPolicyPosition_)
    async UpdateAssociationDemoPolicyPosition(
        @Arg('input', () => UpdateAssociationDemoPolicyPositionInput) input: UpdateAssociationDemoPolicyPositionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Policy Positions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoPolicyPosition_)
    async DeleteAssociationDemoPolicyPosition(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Policy Positions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Post Attachments
//****************************************************************************
@ObjectType()
export class AssociationDemoPostAttachment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PostID: string;
        
    @Field() 
    @MaxLength(510)
    FileName: string;
        
    @Field() 
    @MaxLength(2000)
    FileURL: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    FileType?: string;
        
    @Field(() => Int, {nullable: true}) 
    FileSizeBytes?: number;
        
    @Field() 
    @MaxLength(8)
    UploadedDate: Date;
        
    @Field() 
    @MaxLength(16)
    UploadedByID: string;
        
    @Field(() => Int, {nullable: true}) 
    DownloadCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Post Attachments
//****************************************************************************
@InputType()
export class CreateAssociationDemoPostAttachmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    FileName?: string;

    @Field({ nullable: true })
    FileURL?: string;

    @Field({ nullable: true })
    FileType: string | null;

    @Field(() => Int, { nullable: true })
    FileSizeBytes: number | null;

    @Field({ nullable: true })
    UploadedDate?: Date;

    @Field({ nullable: true })
    UploadedByID?: string;

    @Field(() => Int, { nullable: true })
    DownloadCount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Post Attachments
//****************************************************************************
@InputType()
export class UpdateAssociationDemoPostAttachmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    FileName?: string;

    @Field({ nullable: true })
    FileURL?: string;

    @Field({ nullable: true })
    FileType?: string | null;

    @Field(() => Int, { nullable: true })
    FileSizeBytes?: number | null;

    @Field({ nullable: true })
    UploadedDate?: Date;

    @Field({ nullable: true })
    UploadedByID?: string;

    @Field(() => Int, { nullable: true })
    DownloadCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Post Attachments
//****************************************************************************
@ObjectType()
export class RunAssociationDemoPostAttachmentViewResult {
    @Field(() => [AssociationDemoPostAttachment_])
    Results: AssociationDemoPostAttachment_[];

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

@Resolver(AssociationDemoPostAttachment_)
export class AssociationDemoPostAttachmentResolver extends ResolverBase {
    @Query(() => RunAssociationDemoPostAttachmentViewResult)
    async RunAssociationDemoPostAttachmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPostAttachmentViewResult)
    async RunAssociationDemoPostAttachmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPostAttachmentViewResult)
    async RunAssociationDemoPostAttachmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Post Attachments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoPostAttachment_, { nullable: true })
    async AssociationDemoPostAttachment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPostAttachment_ | null> {
        this.CheckUserReadPermissions('Post Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostAttachments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Post Attachments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoPostAttachment_)
    async CreateAssociationDemoPostAttachment(
        @Arg('input', () => CreateAssociationDemoPostAttachmentInput) input: CreateAssociationDemoPostAttachmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Post Attachments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoPostAttachment_)
    async UpdateAssociationDemoPostAttachment(
        @Arg('input', () => UpdateAssociationDemoPostAttachmentInput) input: UpdateAssociationDemoPostAttachmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Post Attachments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoPostAttachment_)
    async DeleteAssociationDemoPostAttachment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Post Attachments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Post Reactions
//****************************************************************************
@ObjectType()
export class AssociationDemoPostReaction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PostID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(100)
    ReactionType: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Post Reactions
//****************************************************************************
@InputType()
export class CreateAssociationDemoPostReactionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    ReactionType?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Post Reactions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoPostReactionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    ReactionType?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Post Reactions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoPostReactionViewResult {
    @Field(() => [AssociationDemoPostReaction_])
    Results: AssociationDemoPostReaction_[];

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

@Resolver(AssociationDemoPostReaction_)
export class AssociationDemoPostReactionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoPostReactionViewResult)
    async RunAssociationDemoPostReactionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPostReactionViewResult)
    async RunAssociationDemoPostReactionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPostReactionViewResult)
    async RunAssociationDemoPostReactionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Post Reactions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoPostReaction_, { nullable: true })
    async AssociationDemoPostReaction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPostReaction_ | null> {
        this.CheckUserReadPermissions('Post Reactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostReactions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Reactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Post Reactions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoPostReaction_)
    async CreateAssociationDemoPostReaction(
        @Arg('input', () => CreateAssociationDemoPostReactionInput) input: CreateAssociationDemoPostReactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Post Reactions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoPostReaction_)
    async UpdateAssociationDemoPostReaction(
        @Arg('input', () => UpdateAssociationDemoPostReactionInput) input: UpdateAssociationDemoPostReactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Post Reactions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoPostReaction_)
    async DeleteAssociationDemoPostReaction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Post Reactions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Post Tags
//****************************************************************************
@ObjectType()
export class AssociationDemoPostTag_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PostID: string;
        
    @Field() 
    @MaxLength(200)
    TagName: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Post Tags
//****************************************************************************
@InputType()
export class CreateAssociationDemoPostTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    TagName?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Post Tags
//****************************************************************************
@InputType()
export class UpdateAssociationDemoPostTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PostID?: string;

    @Field({ nullable: true })
    TagName?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Post Tags
//****************************************************************************
@ObjectType()
export class RunAssociationDemoPostTagViewResult {
    @Field(() => [AssociationDemoPostTag_])
    Results: AssociationDemoPostTag_[];

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

@Resolver(AssociationDemoPostTag_)
export class AssociationDemoPostTagResolver extends ResolverBase {
    @Query(() => RunAssociationDemoPostTagViewResult)
    async RunAssociationDemoPostTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPostTagViewResult)
    async RunAssociationDemoPostTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoPostTagViewResult)
    async RunAssociationDemoPostTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Post Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoPostTag_, { nullable: true })
    async AssociationDemoPostTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPostTag_ | null> {
        this.CheckUserReadPermissions('Post Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwPostTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Post Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoPostTag_)
    async CreateAssociationDemoPostTag(
        @Arg('input', () => CreateAssociationDemoPostTagInput) input: CreateAssociationDemoPostTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Post Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoPostTag_)
    async UpdateAssociationDemoPostTag(
        @Arg('input', () => UpdateAssociationDemoPostTagInput) input: UpdateAssociationDemoPostTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Post Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoPostTag_)
    async DeleteAssociationDemoPostTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Post Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Product Awards
//****************************************************************************
@ObjectType()
export class AssociationDemoProductAward_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ProductID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CompetitionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CompetitionEntryID?: string;
        
    @Field() 
    @MaxLength(510)
    AwardName: string;
        
    @Field() 
    @MaxLength(200)
    AwardLevel: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    AwardingOrganization?: string;
        
    @Field() 
    @MaxLength(3)
    AwardDate: Date;
        
    @Field(() => Int) 
    Year: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Category?: string;
        
    @Field(() => Float, {nullable: true}) 
    Score?: number;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    CertificateURL?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDisplayed?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Product: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Competition?: string;
        
}

//****************************************************************************
// INPUT TYPE for Product Awards
//****************************************************************************
@InputType()
export class CreateAssociationDemoProductAwardInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CompetitionID: string | null;

    @Field({ nullable: true })
    CompetitionEntryID: string | null;

    @Field({ nullable: true })
    AwardName?: string;

    @Field({ nullable: true })
    AwardLevel?: string;

    @Field({ nullable: true })
    AwardingOrganization: string | null;

    @Field({ nullable: true })
    AwardDate?: Date;

    @Field(() => Int, { nullable: true })
    Year?: number;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Float, { nullable: true })
    Score: number | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CertificateURL: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDisplayed?: boolean | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Product Awards
//****************************************************************************
@InputType()
export class UpdateAssociationDemoProductAwardInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CompetitionID?: string | null;

    @Field({ nullable: true })
    CompetitionEntryID?: string | null;

    @Field({ nullable: true })
    AwardName?: string;

    @Field({ nullable: true })
    AwardLevel?: string;

    @Field({ nullable: true })
    AwardingOrganization?: string | null;

    @Field({ nullable: true })
    AwardDate?: Date;

    @Field(() => Int, { nullable: true })
    Year?: number;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Float, { nullable: true })
    Score?: number | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CertificateURL?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDisplayed?: boolean | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Product Awards
//****************************************************************************
@ObjectType()
export class RunAssociationDemoProductAwardViewResult {
    @Field(() => [AssociationDemoProductAward_])
    Results: AssociationDemoProductAward_[];

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

@Resolver(AssociationDemoProductAward_)
export class AssociationDemoProductAwardResolver extends ResolverBase {
    @Query(() => RunAssociationDemoProductAwardViewResult)
    async RunAssociationDemoProductAwardViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoProductAwardViewResult)
    async RunAssociationDemoProductAwardViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoProductAwardViewResult)
    async RunAssociationDemoProductAwardDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Product Awards';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoProductAward_, { nullable: true })
    async AssociationDemoProductAward(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoProductAward_ | null> {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProductAwards] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Product Awards', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoProductAward_)
    async CreateAssociationDemoProductAward(
        @Arg('input', () => CreateAssociationDemoProductAwardInput) input: CreateAssociationDemoProductAwardInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Product Awards', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoProductAward_)
    async UpdateAssociationDemoProductAward(
        @Arg('input', () => UpdateAssociationDemoProductAwardInput) input: UpdateAssociationDemoProductAwardInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Product Awards', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoProductAward_)
    async DeleteAssociationDemoProductAward(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Product Awards', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Product Categories
//****************************************************************************
@ObjectType()
export class AssociationDemoProductCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentCategoryID?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    ImageURL?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentCategoryID?: string;
        
    @Field(() => [AssociationDemoProductCategory_])
    ProductCategories_ParentCategoryIDArray: AssociationDemoProductCategory_[]; // Link to ProductCategories
    
    @Field(() => [AssociationDemoProduct_])
    Products_CategoryIDArray: AssociationDemoProduct_[]; // Link to Products
    
    @Field(() => [AssociationDemoCompetitionEntry_])
    CompetitionEntries_CategoryIDArray: AssociationDemoCompetitionEntry_[]; // Link to CompetitionEntries
    
}

//****************************************************************************
// INPUT TYPE for Product Categories
//****************************************************************************
@InputType()
export class CreateAssociationDemoProductCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentCategoryID: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field({ nullable: true })
    ImageURL: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Product Categories
//****************************************************************************
@InputType()
export class UpdateAssociationDemoProductCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentCategoryID?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field({ nullable: true })
    ImageURL?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Product Categories
//****************************************************************************
@ObjectType()
export class RunAssociationDemoProductCategoryViewResult {
    @Field(() => [AssociationDemoProductCategory_])
    Results: AssociationDemoProductCategory_[];

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

@Resolver(AssociationDemoProductCategory_)
export class AssociationDemoProductCategoryResolver extends ResolverBase {
    @Query(() => RunAssociationDemoProductCategoryViewResult)
    async RunAssociationDemoProductCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoProductCategoryViewResult)
    async RunAssociationDemoProductCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoProductCategoryViewResult)
    async RunAssociationDemoProductCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Product Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoProductCategory_, { nullable: true })
    async AssociationDemoProductCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoProductCategory_ | null> {
        this.CheckUserReadPermissions('Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProductCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Product Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoProductCategory_])
    async ProductCategories_ParentCategoryIDArray(@Root() associationdemoproductcategory_: AssociationDemoProductCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProductCategories] WHERE [ParentCategoryID]='${associationdemoproductcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Product Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProduct_])
    async Products_CategoryIDArray(@Root() associationdemoproductcategory_: AssociationDemoProductCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProducts] WHERE [CategoryID]='${associationdemoproductcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCompetitionEntry_])
    async CompetitionEntries_CategoryIDArray(@Root() associationdemoproductcategory_: AssociationDemoProductCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionEntries] WHERE [CategoryID]='${associationdemoproductcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Entries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoProductCategory_)
    async CreateAssociationDemoProductCategory(
        @Arg('input', () => CreateAssociationDemoProductCategoryInput) input: CreateAssociationDemoProductCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Product Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoProductCategory_)
    async UpdateAssociationDemoProductCategory(
        @Arg('input', () => UpdateAssociationDemoProductCategoryInput) input: UpdateAssociationDemoProductCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Product Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoProductCategory_)
    async DeleteAssociationDemoProductCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Product Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products
//****************************************************************************
@ObjectType()
export class AssociationDemoProduct_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(16)
    CategoryID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CheeseType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MilkSource?: string;
        
    @Field(() => Int, {nullable: true}) 
    AgeMonths?: number;
        
    @Field(() => Float, {nullable: true}) 
    Weight?: number;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    WeightUnit?: string;
        
    @Field(() => Float, {nullable: true}) 
    RetailPrice?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    IsOrganic?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsRawMilk?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsAwardWinner?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    DateIntroduced?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    ImageURL?: string;
        
    @Field({nullable: true}) 
    TastingNotes?: string;
        
    @Field({nullable: true}) 
    PairingNotes?: string;
        
    @Field({nullable: true}) 
    ProductionMethod?: string;
        
    @Field(() => Int, {nullable: true}) 
    AwardCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Category: string;
        
    @Field(() => [AssociationDemoCompetitionEntry_])
    CompetitionEntries_ProductIDArray: AssociationDemoCompetitionEntry_[]; // Link to CompetitionEntries
    
    @Field(() => [AssociationDemoProductAward_])
    ProductAwards_ProductIDArray: AssociationDemoProductAward_[]; // Link to ProductAwards
    
}

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class CreateAssociationDemoProductInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CheeseType: string | null;

    @Field({ nullable: true })
    MilkSource: string | null;

    @Field(() => Int, { nullable: true })
    AgeMonths: number | null;

    @Field(() => Float, { nullable: true })
    Weight: number | null;

    @Field({ nullable: true })
    WeightUnit?: string | null;

    @Field(() => Float, { nullable: true })
    RetailPrice: number | null;

    @Field(() => Boolean, { nullable: true })
    IsOrganic?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsRawMilk?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsAwardWinner?: boolean | null;

    @Field({ nullable: true })
    DateIntroduced: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    ImageURL: string | null;

    @Field({ nullable: true })
    TastingNotes: string | null;

    @Field({ nullable: true })
    PairingNotes: string | null;

    @Field({ nullable: true })
    ProductionMethod: string | null;

    @Field(() => Int, { nullable: true })
    AwardCount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class UpdateAssociationDemoProductInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CheeseType?: string | null;

    @Field({ nullable: true })
    MilkSource?: string | null;

    @Field(() => Int, { nullable: true })
    AgeMonths?: number | null;

    @Field(() => Float, { nullable: true })
    Weight?: number | null;

    @Field({ nullable: true })
    WeightUnit?: string | null;

    @Field(() => Float, { nullable: true })
    RetailPrice?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsOrganic?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsRawMilk?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsAwardWinner?: boolean | null;

    @Field({ nullable: true })
    DateIntroduced?: Date | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    ImageURL?: string | null;

    @Field({ nullable: true })
    TastingNotes?: string | null;

    @Field({ nullable: true })
    PairingNotes?: string | null;

    @Field({ nullable: true })
    ProductionMethod?: string | null;

    @Field(() => Int, { nullable: true })
    AwardCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products
//****************************************************************************
@ObjectType()
export class RunAssociationDemoProductViewResult {
    @Field(() => [AssociationDemoProduct_])
    Results: AssociationDemoProduct_[];

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

@Resolver(AssociationDemoProduct_)
export class AssociationDemoProductResolver extends ResolverBase {
    @Query(() => RunAssociationDemoProductViewResult)
    async RunAssociationDemoProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoProductViewResult)
    async RunAssociationDemoProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoProductViewResult)
    async RunAssociationDemoProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoProduct_, { nullable: true })
    async AssociationDemoProduct(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoProduct_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProducts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCompetitionEntry_])
    async CompetitionEntries_ProductIDArray(@Root() associationdemoproduct_: AssociationDemoProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCompetitionEntries] WHERE [ProductID]='${associationdemoproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Entries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProductAward_])
    async ProductAwards_ProductIDArray(@Root() associationdemoproduct_: AssociationDemoProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwProductAwards] WHERE [ProductID]='${associationdemoproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Product Awards', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoProduct_)
    async CreateAssociationDemoProduct(
        @Arg('input', () => CreateAssociationDemoProductInput) input: CreateAssociationDemoProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoProduct_)
    async UpdateAssociationDemoProduct(
        @Arg('input', () => UpdateAssociationDemoProductInput) input: UpdateAssociationDemoProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoProduct_)
    async DeleteAssociationDemoProduct(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Regulatory Comments
//****************************************************************************
@ObjectType()
export class AssociationDemoRegulatoryComment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    LegislativeIssueID: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DocketNumber?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    CommentPeriodStart?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    CommentPeriodEnd?: Date;
        
    @Field() 
    @MaxLength(3)
    SubmittedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    SubmittedBy?: string;
        
    @Field() 
    CommentText: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    CommentType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    AttachmentURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ConfirmationNumber?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Status?: string;
        
    @Field({nullable: true}) 
    Response?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Regulatory Comments
//****************************************************************************
@InputType()
export class CreateAssociationDemoRegulatoryCommentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    LegislativeIssueID?: string;

    @Field({ nullable: true })
    DocketNumber: string | null;

    @Field({ nullable: true })
    CommentPeriodStart: Date | null;

    @Field({ nullable: true })
    CommentPeriodEnd: Date | null;

    @Field({ nullable: true })
    SubmittedDate?: Date;

    @Field({ nullable: true })
    SubmittedBy: string | null;

    @Field({ nullable: true })
    CommentText?: string;

    @Field({ nullable: true })
    CommentType: string | null;

    @Field({ nullable: true })
    AttachmentURL: string | null;

    @Field({ nullable: true })
    ConfirmationNumber: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Response: string | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Regulatory Comments
//****************************************************************************
@InputType()
export class UpdateAssociationDemoRegulatoryCommentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    LegislativeIssueID?: string;

    @Field({ nullable: true })
    DocketNumber?: string | null;

    @Field({ nullable: true })
    CommentPeriodStart?: Date | null;

    @Field({ nullable: true })
    CommentPeriodEnd?: Date | null;

    @Field({ nullable: true })
    SubmittedDate?: Date;

    @Field({ nullable: true })
    SubmittedBy?: string | null;

    @Field({ nullable: true })
    CommentText?: string;

    @Field({ nullable: true })
    CommentType?: string | null;

    @Field({ nullable: true })
    AttachmentURL?: string | null;

    @Field({ nullable: true })
    ConfirmationNumber?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Response?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Regulatory Comments
//****************************************************************************
@ObjectType()
export class RunAssociationDemoRegulatoryCommentViewResult {
    @Field(() => [AssociationDemoRegulatoryComment_])
    Results: AssociationDemoRegulatoryComment_[];

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

@Resolver(AssociationDemoRegulatoryComment_)
export class AssociationDemoRegulatoryCommentResolver extends ResolverBase {
    @Query(() => RunAssociationDemoRegulatoryCommentViewResult)
    async RunAssociationDemoRegulatoryCommentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoRegulatoryCommentViewResult)
    async RunAssociationDemoRegulatoryCommentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoRegulatoryCommentViewResult)
    async RunAssociationDemoRegulatoryCommentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Regulatory Comments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoRegulatoryComment_, { nullable: true })
    async AssociationDemoRegulatoryComment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoRegulatoryComment_ | null> {
        this.CheckUserReadPermissions('Regulatory Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwRegulatoryComments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Regulatory Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Regulatory Comments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoRegulatoryComment_)
    async CreateAssociationDemoRegulatoryComment(
        @Arg('input', () => CreateAssociationDemoRegulatoryCommentInput) input: CreateAssociationDemoRegulatoryCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Regulatory Comments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoRegulatoryComment_)
    async UpdateAssociationDemoRegulatoryComment(
        @Arg('input', () => UpdateAssociationDemoRegulatoryCommentInput) input: UpdateAssociationDemoRegulatoryCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Regulatory Comments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoRegulatoryComment_)
    async DeleteAssociationDemoRegulatoryComment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Regulatory Comments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resource Categories
//****************************************************************************
@ObjectType()
export class AssociationDemoResourceCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ParentCategoryID?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Icon?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Color?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    RequiresMembership?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    ResourceCount?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentCategoryID?: string;
        
    @Field(() => [AssociationDemoResourceCategory_])
    ResourceCategories_ParentCategoryIDArray: AssociationDemoResourceCategory_[]; // Link to ResourceCategories
    
    @Field(() => [AssociationDemoResource_])
    Resources_CategoryIDArray: AssociationDemoResource_[]; // Link to Resources
    
}

//****************************************************************************
// INPUT TYPE for Resource Categories
//****************************************************************************
@InputType()
export class CreateAssociationDemoResourceCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentCategoryID: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field({ nullable: true })
    Icon: string | null;

    @Field({ nullable: true })
    Color: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    RequiresMembership?: boolean | null;

    @Field(() => Int, { nullable: true })
    ResourceCount?: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Resource Categories
//****************************************************************************
@InputType()
export class UpdateAssociationDemoResourceCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentCategoryID?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number | null;

    @Field({ nullable: true })
    Icon?: string | null;

    @Field({ nullable: true })
    Color?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    RequiresMembership?: boolean | null;

    @Field(() => Int, { nullable: true })
    ResourceCount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Resource Categories
//****************************************************************************
@ObjectType()
export class RunAssociationDemoResourceCategoryViewResult {
    @Field(() => [AssociationDemoResourceCategory_])
    Results: AssociationDemoResourceCategory_[];

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

@Resolver(AssociationDemoResourceCategory_)
export class AssociationDemoResourceCategoryResolver extends ResolverBase {
    @Query(() => RunAssociationDemoResourceCategoryViewResult)
    async RunAssociationDemoResourceCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceCategoryViewResult)
    async RunAssociationDemoResourceCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceCategoryViewResult)
    async RunAssociationDemoResourceCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Resource Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoResourceCategory_, { nullable: true })
    async AssociationDemoResourceCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceCategory_ | null> {
        this.CheckUserReadPermissions('Resource Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoResourceCategory_])
    async ResourceCategories_ParentCategoryIDArray(@Root() associationdemoresourcecategory_: AssociationDemoResourceCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceCategories] WHERE [ParentCategoryID]='${associationdemoresourcecategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResource_])
    async Resources_CategoryIDArray(@Root() associationdemoresourcecategory_: AssociationDemoResourceCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resources', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResources] WHERE [CategoryID]='${associationdemoresourcecategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resources', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resources', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoResourceCategory_)
    async CreateAssociationDemoResourceCategory(
        @Arg('input', () => CreateAssociationDemoResourceCategoryInput) input: CreateAssociationDemoResourceCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Resource Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoResourceCategory_)
    async UpdateAssociationDemoResourceCategory(
        @Arg('input', () => UpdateAssociationDemoResourceCategoryInput) input: UpdateAssociationDemoResourceCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Resource Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoResourceCategory_)
    async DeleteAssociationDemoResourceCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Resource Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resource Downloads
//****************************************************************************
@ObjectType()
export class AssociationDemoResourceDownload_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ResourceID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(8)
    DownloadDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    IPAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    UserAgent?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Resource Downloads
//****************************************************************************
@InputType()
export class CreateAssociationDemoResourceDownloadInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    DownloadDate?: Date;

    @Field({ nullable: true })
    IPAddress: string | null;

    @Field({ nullable: true })
    UserAgent: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Resource Downloads
//****************************************************************************
@InputType()
export class UpdateAssociationDemoResourceDownloadInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    DownloadDate?: Date;

    @Field({ nullable: true })
    IPAddress?: string | null;

    @Field({ nullable: true })
    UserAgent?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Resource Downloads
//****************************************************************************
@ObjectType()
export class RunAssociationDemoResourceDownloadViewResult {
    @Field(() => [AssociationDemoResourceDownload_])
    Results: AssociationDemoResourceDownload_[];

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

@Resolver(AssociationDemoResourceDownload_)
export class AssociationDemoResourceDownloadResolver extends ResolverBase {
    @Query(() => RunAssociationDemoResourceDownloadViewResult)
    async RunAssociationDemoResourceDownloadViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceDownloadViewResult)
    async RunAssociationDemoResourceDownloadViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceDownloadViewResult)
    async RunAssociationDemoResourceDownloadDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Resource Downloads';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoResourceDownload_, { nullable: true })
    async AssociationDemoResourceDownload(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceDownload_ | null> {
        this.CheckUserReadPermissions('Resource Downloads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceDownloads] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Downloads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Downloads', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoResourceDownload_)
    async CreateAssociationDemoResourceDownload(
        @Arg('input', () => CreateAssociationDemoResourceDownloadInput) input: CreateAssociationDemoResourceDownloadInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Resource Downloads', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoResourceDownload_)
    async UpdateAssociationDemoResourceDownload(
        @Arg('input', () => UpdateAssociationDemoResourceDownloadInput) input: UpdateAssociationDemoResourceDownloadInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Resource Downloads', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoResourceDownload_)
    async DeleteAssociationDemoResourceDownload(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Resource Downloads', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resource Ratings
//****************************************************************************
@ObjectType()
export class AssociationDemoResourceRating_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ResourceID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field(() => Int) 
    Rating: number;
        
    @Field({nullable: true}) 
    Review?: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsHelpful?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Resource Ratings
//****************************************************************************
@InputType()
export class CreateAssociationDemoResourceRatingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field(() => Int, { nullable: true })
    Rating?: number;

    @Field({ nullable: true })
    Review: string | null;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsHelpful?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Resource Ratings
//****************************************************************************
@InputType()
export class UpdateAssociationDemoResourceRatingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field(() => Int, { nullable: true })
    Rating?: number;

    @Field({ nullable: true })
    Review?: string | null;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsHelpful?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Resource Ratings
//****************************************************************************
@ObjectType()
export class RunAssociationDemoResourceRatingViewResult {
    @Field(() => [AssociationDemoResourceRating_])
    Results: AssociationDemoResourceRating_[];

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

@Resolver(AssociationDemoResourceRating_)
export class AssociationDemoResourceRatingResolver extends ResolverBase {
    @Query(() => RunAssociationDemoResourceRatingViewResult)
    async RunAssociationDemoResourceRatingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceRatingViewResult)
    async RunAssociationDemoResourceRatingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceRatingViewResult)
    async RunAssociationDemoResourceRatingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Resource Ratings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoResourceRating_, { nullable: true })
    async AssociationDemoResourceRating(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceRating_ | null> {
        this.CheckUserReadPermissions('Resource Ratings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceRatings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Ratings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Ratings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoResourceRating_)
    async CreateAssociationDemoResourceRating(
        @Arg('input', () => CreateAssociationDemoResourceRatingInput) input: CreateAssociationDemoResourceRatingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Resource Ratings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoResourceRating_)
    async UpdateAssociationDemoResourceRating(
        @Arg('input', () => UpdateAssociationDemoResourceRatingInput) input: UpdateAssociationDemoResourceRatingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Resource Ratings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoResourceRating_)
    async DeleteAssociationDemoResourceRating(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Resource Ratings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resource Tags
//****************************************************************************
@ObjectType()
export class AssociationDemoResourceTag_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ResourceID: string;
        
    @Field() 
    @MaxLength(200)
    TagName: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Resource Tags
//****************************************************************************
@InputType()
export class CreateAssociationDemoResourceTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    TagName?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Resource Tags
//****************************************************************************
@InputType()
export class UpdateAssociationDemoResourceTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    TagName?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Resource Tags
//****************************************************************************
@ObjectType()
export class RunAssociationDemoResourceTagViewResult {
    @Field(() => [AssociationDemoResourceTag_])
    Results: AssociationDemoResourceTag_[];

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

@Resolver(AssociationDemoResourceTag_)
export class AssociationDemoResourceTagResolver extends ResolverBase {
    @Query(() => RunAssociationDemoResourceTagViewResult)
    async RunAssociationDemoResourceTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceTagViewResult)
    async RunAssociationDemoResourceTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceTagViewResult)
    async RunAssociationDemoResourceTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Resource Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoResourceTag_, { nullable: true })
    async AssociationDemoResourceTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceTag_ | null> {
        this.CheckUserReadPermissions('Resource Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoResourceTag_)
    async CreateAssociationDemoResourceTag(
        @Arg('input', () => CreateAssociationDemoResourceTagInput) input: CreateAssociationDemoResourceTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Resource Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoResourceTag_)
    async UpdateAssociationDemoResourceTag(
        @Arg('input', () => UpdateAssociationDemoResourceTagInput) input: UpdateAssociationDemoResourceTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Resource Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoResourceTag_)
    async DeleteAssociationDemoResourceTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Resource Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resource Versions
//****************************************************************************
@ObjectType()
export class AssociationDemoResourceVersion_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ResourceID: string;
        
    @Field() 
    @MaxLength(40)
    VersionNumber: string;
        
    @Field({nullable: true}) 
    VersionNotes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2000)
    FileURL?: string;
        
    @Field(() => Int, {nullable: true}) 
    FileSizeBytes?: number;
        
    @Field() 
    @MaxLength(16)
    CreatedByID: string;
        
    @Field() 
    @MaxLength(8)
    CreatedDate: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsCurrent?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Resource Versions
//****************************************************************************
@InputType()
export class CreateAssociationDemoResourceVersionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    VersionNumber?: string;

    @Field({ nullable: true })
    VersionNotes: string | null;

    @Field({ nullable: true })
    FileURL: string | null;

    @Field(() => Int, { nullable: true })
    FileSizeBytes: number | null;

    @Field({ nullable: true })
    CreatedByID?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsCurrent?: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Resource Versions
//****************************************************************************
@InputType()
export class UpdateAssociationDemoResourceVersionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ResourceID?: string;

    @Field({ nullable: true })
    VersionNumber?: string;

    @Field({ nullable: true })
    VersionNotes?: string | null;

    @Field({ nullable: true })
    FileURL?: string | null;

    @Field(() => Int, { nullable: true })
    FileSizeBytes?: number | null;

    @Field({ nullable: true })
    CreatedByID?: string;

    @Field({ nullable: true })
    CreatedDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsCurrent?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Resource Versions
//****************************************************************************
@ObjectType()
export class RunAssociationDemoResourceVersionViewResult {
    @Field(() => [AssociationDemoResourceVersion_])
    Results: AssociationDemoResourceVersion_[];

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

@Resolver(AssociationDemoResourceVersion_)
export class AssociationDemoResourceVersionResolver extends ResolverBase {
    @Query(() => RunAssociationDemoResourceVersionViewResult)
    async RunAssociationDemoResourceVersionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceVersionViewResult)
    async RunAssociationDemoResourceVersionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceVersionViewResult)
    async RunAssociationDemoResourceVersionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Resource Versions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoResourceVersion_, { nullable: true })
    async AssociationDemoResourceVersion(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceVersion_ | null> {
        this.CheckUserReadPermissions('Resource Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceVersions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Versions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AssociationDemoResourceVersion_)
    async CreateAssociationDemoResourceVersion(
        @Arg('input', () => CreateAssociationDemoResourceVersionInput) input: CreateAssociationDemoResourceVersionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Resource Versions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoResourceVersion_)
    async UpdateAssociationDemoResourceVersion(
        @Arg('input', () => UpdateAssociationDemoResourceVersionInput) input: UpdateAssociationDemoResourceVersionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Resource Versions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoResourceVersion_)
    async DeleteAssociationDemoResourceVersion(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Resource Versions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resources
//****************************************************************************
@ObjectType()
export class AssociationDemoResource_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    CategoryID: string;
        
    @Field() 
    @MaxLength(1000)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(100)
    ResourceType: string;
        
    @Field({nullable: true}) 
    @MaxLength(2000)
    FileURL?: string;
        
    @Field(() => Int, {nullable: true}) 
    FileSizeBytes?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MimeType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    AuthorID?: string;
        
    @Field() 
    @MaxLength(8)
    PublishedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastUpdatedDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    ViewCount?: number;
        
    @Field(() => Int, {nullable: true}) 
    DownloadCount?: number;
        
    @Field(() => Float, {nullable: true}) 
    AverageRating?: number;
        
    @Field(() => Int, {nullable: true}) 
    RatingCount?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    IsFeatured?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    RequiresMembership?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    Status?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Category: string;
        
    @Field(() => [AssociationDemoResourceTag_])
    ResourceTags_ResourceIDArray: AssociationDemoResourceTag_[]; // Link to ResourceTags
    
    @Field(() => [AssociationDemoResourceRating_])
    ResourceRatings_ResourceIDArray: AssociationDemoResourceRating_[]; // Link to ResourceRatings
    
    @Field(() => [AssociationDemoResourceDownload_])
    ResourceDownloads_ResourceIDArray: AssociationDemoResourceDownload_[]; // Link to ResourceDownloads
    
    @Field(() => [AssociationDemoResourceVersion_])
    ResourceVersions_ResourceIDArray: AssociationDemoResourceVersion_[]; // Link to ResourceVersions
    
}

//****************************************************************************
// INPUT TYPE for Resources
//****************************************************************************
@InputType()
export class CreateAssociationDemoResourceInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ResourceType?: string;

    @Field({ nullable: true })
    FileURL: string | null;

    @Field(() => Int, { nullable: true })
    FileSizeBytes: number | null;

    @Field({ nullable: true })
    MimeType: string | null;

    @Field({ nullable: true })
    AuthorID: string | null;

    @Field({ nullable: true })
    PublishedDate?: Date;

    @Field({ nullable: true })
    LastUpdatedDate: Date | null;

    @Field(() => Int, { nullable: true })
    ViewCount?: number | null;

    @Field(() => Int, { nullable: true })
    DownloadCount?: number | null;

    @Field(() => Float, { nullable: true })
    AverageRating?: number | null;

    @Field(() => Int, { nullable: true })
    RatingCount?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsFeatured?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    RequiresMembership?: boolean | null;

    @Field({ nullable: true })
    Status?: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Resources
//****************************************************************************
@InputType()
export class UpdateAssociationDemoResourceInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ResourceType?: string;

    @Field({ nullable: true })
    FileURL?: string | null;

    @Field(() => Int, { nullable: true })
    FileSizeBytes?: number | null;

    @Field({ nullable: true })
    MimeType?: string | null;

    @Field({ nullable: true })
    AuthorID?: string | null;

    @Field({ nullable: true })
    PublishedDate?: Date;

    @Field({ nullable: true })
    LastUpdatedDate?: Date | null;

    @Field(() => Int, { nullable: true })
    ViewCount?: number | null;

    @Field(() => Int, { nullable: true })
    DownloadCount?: number | null;

    @Field(() => Float, { nullable: true })
    AverageRating?: number | null;

    @Field(() => Int, { nullable: true })
    RatingCount?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsFeatured?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    RequiresMembership?: boolean | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Resources
//****************************************************************************
@ObjectType()
export class RunAssociationDemoResourceViewResult {
    @Field(() => [AssociationDemoResource_])
    Results: AssociationDemoResource_[];

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

@Resolver(AssociationDemoResource_)
export class AssociationDemoResourceResolver extends ResolverBase {
    @Query(() => RunAssociationDemoResourceViewResult)
    async RunAssociationDemoResourceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceViewResult)
    async RunAssociationDemoResourceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoResourceViewResult)
    async RunAssociationDemoResourceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Resources';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoResource_, { nullable: true })
    async AssociationDemoResource(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResource_ | null> {
        this.CheckUserReadPermissions('Resources', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResources] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resources', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resources', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoResourceTag_])
    async ResourceTags_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceTags] WHERE [ResourceID]='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceRating_])
    async ResourceRatings_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Ratings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceRatings] WHERE [ResourceID]='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Ratings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Ratings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceDownload_])
    async ResourceDownloads_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Downloads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceDownloads] WHERE [ResourceID]='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Downloads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Downloads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceVersion_])
    async ResourceVersions_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwResourceVersions] WHERE [ResourceID]='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Versions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoResource_)
    async CreateAssociationDemoResource(
        @Arg('input', () => CreateAssociationDemoResourceInput) input: CreateAssociationDemoResourceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Resources', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoResource_)
    async UpdateAssociationDemoResource(
        @Arg('input', () => UpdateAssociationDemoResourceInput) input: UpdateAssociationDemoResourceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Resources', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoResource_)
    async DeleteAssociationDemoResource(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Resources', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Segments
//****************************************************************************
@ObjectType({ description: `Member segmentation for targeted marketing` })
export class AssociationDemoSegment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Segment name`}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true, description: `Segment type (Industry, Geography, Engagement, Membership Type, etc.)`}) 
    @MaxLength(100)
    SegmentType?: string;
        
    @Field({nullable: true, description: `Filter criteria (JSON or SQL WHERE clause)`}) 
    FilterCriteria?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of members matching this segment`}) 
    MemberCount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastCalculatedDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCampaignMember_])
    CampaignMembers_SegmentIDArray: AssociationDemoCampaignMember_[]; // Link to CampaignMembers
    
}

//****************************************************************************
// INPUT TYPE for Segments
//****************************************************************************
@InputType()
export class CreateAssociationDemoSegmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    SegmentType: string | null;

    @Field({ nullable: true })
    FilterCriteria: string | null;

    @Field(() => Int, { nullable: true })
    MemberCount: number | null;

    @Field({ nullable: true })
    LastCalculatedDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Segments
//****************************************************************************
@InputType()
export class UpdateAssociationDemoSegmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    SegmentType?: string | null;

    @Field({ nullable: true })
    FilterCriteria?: string | null;

    @Field(() => Int, { nullable: true })
    MemberCount?: number | null;

    @Field({ nullable: true })
    LastCalculatedDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Segments
//****************************************************************************
@ObjectType()
export class RunAssociationDemoSegmentViewResult {
    @Field(() => [AssociationDemoSegment_])
    Results: AssociationDemoSegment_[];

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

@Resolver(AssociationDemoSegment_)
export class AssociationDemoSegmentResolver extends ResolverBase {
    @Query(() => RunAssociationDemoSegmentViewResult)
    async RunAssociationDemoSegmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoSegmentViewResult)
    async RunAssociationDemoSegmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAssociationDemoSegmentViewResult)
    async RunAssociationDemoSegmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Segments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AssociationDemoSegment_, { nullable: true })
    async AssociationDemoSegment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoSegment_ | null> {
        this.CheckUserReadPermissions('Segments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwSegments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Segments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Segments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCampaignMember_])
    async CampaignMembers_SegmentIDArray(@Root() associationdemosegment_: AssociationDemoSegment_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AssociationDemo].[vwCampaignMembers] WHERE [SegmentID]='${associationdemosegment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Campaign Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AssociationDemoSegment_)
    async CreateAssociationDemoSegment(
        @Arg('input', () => CreateAssociationDemoSegmentInput) input: CreateAssociationDemoSegmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Segments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AssociationDemoSegment_)
    async UpdateAssociationDemoSegment(
        @Arg('input', () => UpdateAssociationDemoSegmentInput) input: UpdateAssociationDemoSegmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Segments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AssociationDemoSegment_)
    async DeleteAssociationDemoSegment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Segments', key, options, provider, userPayload, pubSub);
    }
    
}