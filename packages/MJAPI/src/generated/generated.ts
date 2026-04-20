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


import { AssociationDemoAccreditingBodyEntity, AssociationDemoAdvocacyActionEntity, AssociationDemoBoardMemberEntity, AssociationDemoBoardPositionEntity, AssociationDemoCampaignMemberEntity, AssociationDemoCampaignEntity, AssociationDemoCertificateEntity, AssociationDemoCertificationRenewalEntity, AssociationDemoCertificationRequirementEntity, AssociationDemoCertificationTypeEntity, AssociationDemoCertificationEntity, AssociationDemoChapterMembershipEntity, AssociationDemoChapterOfficerEntity, AssociationDemoChapterEntity, AssociationDemoCommitteeMembershipEntity, AssociationDemoCommitteeEntity, AssociationDemoCompetitionEntryEntity, AssociationDemoCompetitionJudgeEntity, AssociationDemoCompetitionEntity, AssociationDemoContinuingEducationEntity, AssociationDemoCourseEntity, AssociationDemoEmailClickEntity, AssociationDemoEmailSendEntity, AssociationDemoEmailTemplateEntity, AssociationDemoEnrollmentEntity, AssociationDemoEventRegistrationEntity, AssociationDemoEventSessionEntity, AssociationDemoEventEntity, AssociationDemoForumCategoryEntity, AssociationDemoForumModerationEntity, AssociationDemoForumPostEntity, AssociationDemoForumThreadEntity, AssociationDemoGovernmentContactEntity, AssociationDemoInvoiceLineItemEntity, AssociationDemoInvoiceEntity, AssociationDemoLegislativeBodyEntity, AssociationDemoLegislativeIssueEntity, AssociationDemoMemberFollowEntity, AssociationDemoMemberEntity, AssociationDemoMembershipTypeEntity, AssociationDemoMembershipEntity, AssociationDemoOrganizationEntity, AssociationDemoPaymentEntity, AssociationDemoPolicyPositionEntity, AssociationDemoPostAttachmentEntity, AssociationDemoPostReactionEntity, AssociationDemoPostTagEntity, AssociationDemoProductAwardEntity, AssociationDemoProductCategoryEntity, AssociationDemoProductEntity, AssociationDemoRegulatoryCommentEntity, AssociationDemoResourceCategoryEntity, AssociationDemoResourceDownloadEntity, AssociationDemoResourceRatingEntity, AssociationDemoResourceTagEntity, AssociationDemoResourceVersionEntity, AssociationDemoResourceEntity, AssociationDemoSegmentEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Accrediting Bodies
//****************************************************************************
@ObjectType()
export class AssociationDemoAccreditingBody_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Abbreviation?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ContactEmail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    ContactPhone?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsRecognized?: boolean;
        
    @Field({nullable: true}) 
    EstablishedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Country?: string;
        
    @Field(() => Int, {nullable: true}) 
    CertificationCount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoCertificationType_])
    AssociationDemoCertificationTypes_AccreditingBodyIDArray: AssociationDemoCertificationType_[]; // Link to AssociationDemoCertificationTypes
    
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
    async AssociationDemoAccreditingBody(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoAccreditingBody_ | null> {
        this.CheckUserReadPermissions('Accrediting Bodies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwAccreditingBodies')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Accrediting Bodies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Accrediting Bodies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificationType_])
    async AssociationDemoCertificationTypes_AccreditingBodyIDArray(@Root() associationdemoaccreditingbody_: AssociationDemoAccreditingBody_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificationTypes')} WHERE ${provider.QuoteIdentifier('AccreditingBodyID')}='${associationdemoaccreditingbody_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    LegislativeIssueID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MemberID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    GovernmentContactID?: string;
        
    @Field() 
    @MaxLength(50)
    ActionType: string;
        
    @Field() 
    ActionDate: Date;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    Outcome?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    FollowUpRequired?: boolean;
        
    @Field({nullable: true}) 
    FollowUpDate?: Date;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoAdvocacyAction(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoAdvocacyAction_ | null> {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwAdvocacyActions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Advocacy Actions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Board position held`}) 
    @MaxLength(36)
    BoardPositionID: string;
        
    @Field({description: `Member serving on board`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Start date of board service`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of board service`}) 
    EndDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Date member was elected to this position`}) 
    ElectionDate?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoBoardMember(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoBoardMember_ | null> {
        this.CheckUserReadPermissions('Board Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwBoardMembers')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Board Members', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Position title (President, Vice President, Treasurer, etc.)`}) 
    @MaxLength(100)
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
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoBoardMember_])
    AssociationDemoBoardMembers_BoardPositionIDArray: AssociationDemoBoardMember_[]; // Link to AssociationDemoBoardMembers
    
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
    async AssociationDemoBoardPosition(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoBoardPosition_ | null> {
        this.CheckUserReadPermissions('Board Positions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwBoardPositions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Positions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Board Positions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoBoardMember_])
    async AssociationDemoBoardMembers_BoardPositionIDArray(@Root() associationdemoboardposition_: AssociationDemoBoardPosition_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Board Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwBoardMembers')} WHERE ${provider.QuoteIdentifier('BoardPositionID')}='${associationdemoboardposition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Campaign targeting this member`}) 
    @MaxLength(36)
    CampaignID: string;
        
    @Field({description: `Member being targeted`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({nullable: true, description: `Segment this member was added through`}) 
    @MaxLength(36)
    SegmentID?: string;
        
    @Field({description: `Date member was added to campaign`}) 
    AddedDate: Date;
        
    @Field({description: `Campaign member status: Targeted, Sent, Responded, Converted, or Opted Out`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    ResponseDate?: Date;
        
    @Field(() => Float, {nullable: true, description: `Value of conversion (revenue generated from this campaign interaction)`}) 
    ConversionValue?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Campaign: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
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
    async AssociationDemoCampaignMember(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCampaignMember_ | null> {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCampaignMembers')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaign Members', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Campaign name`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({description: `Campaign type: Email, Event Promotion, Membership Renewal, Course Launch, Donation Drive, or Member Engagement`}) 
    @MaxLength(50)
    CampaignType: string;
        
    @Field({description: `Campaign status: Draft, Scheduled, Active, Completed, or Cancelled`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Campaign start date`}) 
    StartDate?: Date;
        
    @Field({nullable: true, description: `Campaign end date`}) 
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
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoEmailSend_])
    AssociationDemoEmailSends_CampaignIDArray: AssociationDemoEmailSend_[]; // Link to AssociationDemoEmailSends
    
    @Field(() => [AssociationDemoCampaignMember_])
    AssociationDemoCampaignMembers_CampaignIDArray: AssociationDemoCampaignMember_[]; // Link to AssociationDemoCampaignMembers
    
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
    async AssociationDemoCampaign(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCampaign_ | null> {
        this.CheckUserReadPermissions('Campaigns', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCampaigns')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaigns', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaigns', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEmailSend_])
    async AssociationDemoEmailSends_CampaignIDArray(@Root() associationdemocampaign_: AssociationDemoCampaign_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailSends')} WHERE ${provider.QuoteIdentifier('CampaignID')}='${associationdemocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Sends', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCampaignMember_])
    async AssociationDemoCampaignMembers_CampaignIDArray(@Root() associationdemocampaign_: AssociationDemoCampaign_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCampaignMembers')} WHERE ${provider.QuoteIdentifier('CampaignID')}='${associationdemocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Campaign Members', rows, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Course enrollment this certificate is for`}) 
    @MaxLength(36)
    EnrollmentID: string;
        
    @Field({description: `Unique certificate number`}) 
    @MaxLength(50)
    CertificateNumber: string;
        
    @Field({description: `Date certificate was issued`}) 
    IssuedDate: Date;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field({nullable: true, description: `URL to downloadable PDF certificate`}) 
    @MaxLength(500)
    CertificatePDFURL?: string;
        
    @Field({nullable: true, description: `Unique verification code for authenticity checking`}) 
    @MaxLength(100)
    VerificationCode?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoCertificate(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificate_ | null> {
        this.CheckUserReadPermissions('Certificates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificates')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certificates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certificates', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CertificationID: string;
        
    @Field() 
    RenewalDate: Date;
        
    @Field() 
    ExpirationDate: Date;
        
    @Field(() => Int, {nullable: true}) 
    CECreditsApplied?: number;
        
    @Field(() => Float, {nullable: true}) 
    FeePaid?: number;
        
    @Field({nullable: true}) 
    PaymentDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ProcessedBy?: string;
        
    @Field({nullable: true}) 
    ProcessedDate?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoCertificationRenewal(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificationRenewal_ | null> {
        this.CheckUserReadPermissions('Certification Renewals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificationRenewals')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Renewals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Renewals', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CertificationTypeID: string;
        
    @Field() 
    @MaxLength(100)
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
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoCertificationRequirement(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificationRequirement_ | null> {
        this.CheckUserReadPermissions('Certification Requirements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificationRequirements')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Requirements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Requirements', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    AccreditingBodyID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Abbreviation?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
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
    @MaxLength(500)
    TargetAudience?: string;
        
    @Field(() => Int, {nullable: true}) 
    CertificationCount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    AccreditingBody: string;
        
    @Field(() => [AssociationDemoCertificationRequirement_])
    AssociationDemoCertificationRequirements_CertificationTypeIDArray: AssociationDemoCertificationRequirement_[]; // Link to AssociationDemoCertificationRequirements
    
    @Field(() => [AssociationDemoCertification_])
    AssociationDemoCertifications_CertificationTypeIDArray: AssociationDemoCertification_[]; // Link to AssociationDemoCertifications
    
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
    async AssociationDemoCertificationType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertificationType_ | null> {
        this.CheckUserReadPermissions('Certification Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificationTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certification Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificationRequirement_])
    async AssociationDemoCertificationRequirements_CertificationTypeIDArray(@Root() associationdemocertificationtype_: AssociationDemoCertificationType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Requirements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificationRequirements')} WHERE ${provider.QuoteIdentifier('CertificationTypeID')}='${associationdemocertificationtype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Requirements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certification Requirements', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCertification_])
    async AssociationDemoCertifications_CertificationTypeIDArray(@Root() associationdemocertificationtype_: AssociationDemoCertificationType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertifications')} WHERE ${provider.QuoteIdentifier('CertificationTypeID')}='${associationdemocertificationtype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field() 
    @MaxLength(36)
    CertificationTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    CertificationNumber?: string;
        
    @Field() 
    DateEarned: Date;
        
    @Field({nullable: true}) 
    DateExpires?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field(() => Int, {nullable: true}) 
    Score?: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    VerificationURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    IssuedBy?: string;
        
    @Field({nullable: true}) 
    LastRenewalDate?: Date;
        
    @Field({nullable: true}) 
    NextRenewalDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    CECreditsEarned?: number;
        
    @Field(() => Int, {nullable: true}) 
    RenewalCount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    CertificationType: string;
        
    @Field(() => [AssociationDemoCertificationRenewal_])
    AssociationDemoCertificationRenewals_CertificationIDArray: AssociationDemoCertificationRenewal_[]; // Link to AssociationDemoCertificationRenewals
    
    @Field(() => [AssociationDemoContinuingEducation_])
    AssociationDemoContinuingEducations_CertificationIDArray: AssociationDemoContinuingEducation_[]; // Link to AssociationDemoContinuingEducations
    
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
    async AssociationDemoCertification(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCertification_ | null> {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertifications')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Certifications', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificationRenewal_])
    async AssociationDemoCertificationRenewals_CertificationIDArray(@Root() associationdemocertification_: AssociationDemoCertification_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certification Renewals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificationRenewals')} WHERE ${provider.QuoteIdentifier('CertificationID')}='${associationdemocertification_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certification Renewals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certification Renewals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoContinuingEducation_])
    async AssociationDemoContinuingEducations_CertificationIDArray(@Root() associationdemocertification_: AssociationDemoCertification_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Continuing Educations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwContinuingEducations')} WHERE ${provider.QuoteIdentifier('CertificationID')}='${associationdemocertification_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Continuing Educations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Chapter this membership is for`}) 
    @MaxLength(36)
    ChapterID: string;
        
    @Field({description: `Member participating in chapter`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Date member joined the chapter`}) 
    JoinDate: Date;
        
    @Field({description: `Membership status: Active or Inactive`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Role within chapter (Member, Officer, etc.)`}) 
    @MaxLength(100)
    Role?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoChapterMembership(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoChapterMembership_ | null> {
        this.CheckUserReadPermissions('Chapter Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapterMemberships')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Chapter Memberships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Chapter this officer serves`}) 
    @MaxLength(36)
    ChapterID: string;
        
    @Field({description: `Member serving as officer`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Officer position (President, Vice President, Secretary, etc.)`}) 
    @MaxLength(100)
    Position: string;
        
    @Field({description: `Start date of officer term`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of officer term`}) 
    EndDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoChapterOfficer(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoChapterOfficer_ | null> {
        this.CheckUserReadPermissions('Chapter Officers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapterOfficers')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Officers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Chapter Officers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Chapter name`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({description: `Chapter type: Geographic, Special Interest, or Industry`}) 
    @MaxLength(50)
    ChapterType: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Region?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Country?: string;
        
    @Field({nullable: true, description: `Date chapter was founded`}) 
    FoundedDate?: Date;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Email?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `How often the chapter meets`}) 
    @MaxLength(100)
    MeetingFrequency?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of active members in this chapter`}) 
    MemberCount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoChapterMembership_])
    AssociationDemoChapterMemberships_ChapterIDArray: AssociationDemoChapterMembership_[]; // Link to AssociationDemoChapterMemberships
    
    @Field(() => [AssociationDemoChapterOfficer_])
    AssociationDemoChapterOfficers_ChapterIDArray: AssociationDemoChapterOfficer_[]; // Link to AssociationDemoChapterOfficers
    
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
    async AssociationDemoChapter(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoChapter_ | null> {
        this.CheckUserReadPermissions('Chapters', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapters')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapters', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Chapters', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoChapterMembership_])
    async AssociationDemoChapterMemberships_ChapterIDArray(@Root() associationdemochapter_: AssociationDemoChapter_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapterMemberships')} WHERE ${provider.QuoteIdentifier('ChapterID')}='${associationdemochapter_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoChapterOfficer_])
    async AssociationDemoChapterOfficers_ChapterIDArray(@Root() associationdemochapter_: AssociationDemoChapter_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Officers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapterOfficers')} WHERE ${provider.QuoteIdentifier('ChapterID')}='${associationdemochapter_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Officers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Committee this membership is for`}) 
    @MaxLength(36)
    CommitteeID: string;
        
    @Field({description: `Member serving on committee`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Role on committee (Chair, Vice Chair, Member, etc.)`}) 
    @MaxLength(100)
    Role: string;
        
    @Field({description: `Start date of committee service`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `End date of committee service`}) 
    EndDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Who appointed this member to the committee`}) 
    @MaxLength(255)
    AppointedBy?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoCommitteeMembership(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCommitteeMembership_ | null> {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCommitteeMemberships')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Committee Memberships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Committee name`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({description: `Committee type: Standing, Ad Hoc, or Task Force`}) 
    @MaxLength(50)
    CommitteeType: string;
        
    @Field({nullable: true, description: `Purpose and charter of the committee`}) 
    Purpose?: string;
        
    @Field({nullable: true, description: `How often committee meets`}) 
    @MaxLength(100)
    MeetingFrequency?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Date committee was formed`}) 
    FormedDate?: Date;
        
    @Field({nullable: true}) 
    DisbandedDate?: Date;
        
    @Field({nullable: true, description: `Member serving as committee chair`}) 
    @MaxLength(36)
    ChairMemberID?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum number of committee members allowed`}) 
    MaxMembers?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCommitteeMembership_])
    AssociationDemoCommitteeMemberships_CommitteeIDArray: AssociationDemoCommitteeMembership_[]; // Link to AssociationDemoCommitteeMemberships
    
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
    async AssociationDemoCommittee(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCommittee_ | null> {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCommittees')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Committees', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCommitteeMembership_])
    async AssociationDemoCommitteeMemberships_CommitteeIDArray(@Root() associationdemocommittee_: AssociationDemoCommittee_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCommitteeMemberships')} WHERE ${provider.QuoteIdentifier('CommitteeID')}='${associationdemocommittee_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CompetitionID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field() 
    @MaxLength(36)
    CategoryID: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    EntryNumber?: string;
        
    @Field() 
    SubmittedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field(() => Float, {nullable: true}) 
    Score?: number;
        
    @Field(() => Int, {nullable: true}) 
    Ranking?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    AwardLevel?: string;
        
    @Field({nullable: true}) 
    JudgingNotes?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    FeedbackProvided?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    EntryFee?: number;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    PaymentStatus?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Competition: string;
        
    @Field() 
    @MaxLength(255)
    Product: string;
        
    @Field() 
    @MaxLength(255)
    Category: string;
        
    @Field(() => [AssociationDemoProductAward_])
    AssociationDemoProductAwards_CompetitionEntryIDArray: AssociationDemoProductAward_[]; // Link to AssociationDemoProductAwards
    
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
    async AssociationDemoCompetitionEntry(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCompetitionEntry_ | null> {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionEntries')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Competition Entries', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoProductAward_])
    async AssociationDemoProductAwards_CompetitionEntryIDArray(@Root() associationdemocompetitionentry_: AssociationDemoCompetitionEntry_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProductAwards')} WHERE ${provider.QuoteIdentifier('CompetitionEntryID')}='${associationdemocompetitionentry_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CompetitionID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MemberID?: string;
        
    @Field() 
    @MaxLength(100)
    FirstName: string;
        
    @Field() 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field({nullable: true}) 
    Credentials?: string;
        
    @Field(() => Int, {nullable: true}) 
    YearsExperience?: number;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Specialty?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Role?: string;
        
    @Field({nullable: true}) 
    AssignedCategories?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field({nullable: true}) 
    InvitedDate?: Date;
        
    @Field({nullable: true}) 
    ConfirmedDate?: Date;
        
    @Field(() => Float, {nullable: true}) 
    CompensationAmount?: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoCompetitionJudge(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCompetitionJudge_ | null> {
        this.CheckUserReadPermissions('Competition Judges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionJudges')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Judges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Competition Judges', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field(() => Int) 
    Year: number;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    StartDate: Date;
        
    @Field() 
    EndDate: Date;
        
    @Field({nullable: true}) 
    JudgingDate?: Date;
        
    @Field({nullable: true}) 
    AwardsDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Location?: string;
        
    @Field({nullable: true}) 
    EntryDeadline?: Date;
        
    @Field(() => Float, {nullable: true}) 
    EntryFee?: number;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field(() => Int, {nullable: true}) 
    TotalEntries?: number;
        
    @Field(() => Int, {nullable: true}) 
    TotalCategories?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ContactEmail?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsAnnual?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsInternational?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoCompetitionJudge_])
    AssociationDemoCompetitionJudges_CompetitionIDArray: AssociationDemoCompetitionJudge_[]; // Link to AssociationDemoCompetitionJudges
    
    @Field(() => [AssociationDemoCompetitionEntry_])
    AssociationDemoCompetitionEntries_CompetitionIDArray: AssociationDemoCompetitionEntry_[]; // Link to AssociationDemoCompetitionEntries
    
    @Field(() => [AssociationDemoProductAward_])
    AssociationDemoProductAwards_CompetitionIDArray: AssociationDemoProductAward_[]; // Link to AssociationDemoProductAwards
    
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
    async AssociationDemoCompetition(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCompetition_ | null> {
        this.CheckUserReadPermissions('Competitions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competitions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Competitions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCompetitionJudge_])
    async AssociationDemoCompetitionJudges_CompetitionIDArray(@Root() associationdemocompetition_: AssociationDemoCompetition_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Judges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionJudges')} WHERE ${provider.QuoteIdentifier('CompetitionID')}='${associationdemocompetition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Judges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Judges', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCompetitionEntry_])
    async AssociationDemoCompetitionEntries_CompetitionIDArray(@Root() associationdemocompetition_: AssociationDemoCompetition_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionEntries')} WHERE ${provider.QuoteIdentifier('CompetitionID')}='${associationdemocompetition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Entries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProductAward_])
    async AssociationDemoProductAwards_CompetitionIDArray(@Root() associationdemocompetition_: AssociationDemoCompetition_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProductAwards')} WHERE ${provider.QuoteIdentifier('CompetitionID')}='${associationdemocompetition_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CertificationID?: string;
        
    @Field() 
    @MaxLength(500)
    ActivityTitle: string;
        
    @Field() 
    @MaxLength(100)
    ActivityType: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Provider?: string;
        
    @Field() 
    CompletionDate: Date;
        
    @Field(() => Float) 
    CreditsEarned: number;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    CreditsType?: string;
        
    @Field(() => Float, {nullable: true}) 
    HoursSpent?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    VerificationCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    DocumentURL?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoContinuingEducation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoContinuingEducation_ | null> {
        this.CheckUserReadPermissions('Continuing Educations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwContinuingEducations')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Continuing Educations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Continuing Educations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Unique course code`}) 
    @MaxLength(50)
    Code: string;
        
    @Field({description: `Course title`}) 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Category?: string;
        
    @Field({description: `Course difficulty level: Beginner, Intermediate, Advanced, or Expert`}) 
    @MaxLength(20)
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
    PublishedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    InstructorName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PrerequisiteCourseID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ThumbnailURL?: string;
        
    @Field({nullable: true}) 
    LearningObjectives?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootPrerequisiteCourseID?: string;
        
    @Field(() => [AssociationDemoCourse_])
    AssociationDemoCourses_PrerequisiteCourseIDArray: AssociationDemoCourse_[]; // Link to AssociationDemoCourses
    
    @Field(() => [AssociationDemoEnrollment_])
    AssociationDemoEnrollments_CourseIDArray: AssociationDemoEnrollment_[]; // Link to AssociationDemoEnrollments
    
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
    async AssociationDemoCourse(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoCourse_ | null> {
        this.CheckUserReadPermissions('Courses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCourses')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Courses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Courses', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCourse_])
    async AssociationDemoCourses_PrerequisiteCourseIDArray(@Root() associationdemocourse_: AssociationDemoCourse_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Courses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCourses')} WHERE ${provider.QuoteIdentifier('PrerequisiteCourseID')}='${associationdemocourse_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Courses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Courses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEnrollment_])
    async AssociationDemoEnrollments_CourseIDArray(@Root() associationdemocourse_: AssociationDemoCourse_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Enrollments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEnrollments')} WHERE ${provider.QuoteIdentifier('CourseID')}='${associationdemocourse_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Enrollments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Email send this click is associated with`}) 
    @MaxLength(36)
    EmailSendID: string;
        
    @Field({description: `Date and time link was clicked`}) 
    ClickDate: Date;
        
    @Field({description: `URL that was clicked`}) 
    @MaxLength(2000)
    URL: string;
        
    @Field({nullable: true, description: `Friendly name for the link`}) 
    @MaxLength(255)
    LinkName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    IPAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    UserAgent?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoEmailClick(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEmailClick_ | null> {
        this.CheckUserReadPermissions('Email Clicks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailClicks')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Clicks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Clicks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: `Template used for this email`}) 
    @MaxLength(36)
    TemplateID?: string;
        
    @Field({nullable: true, description: `Campaign this email is part of`}) 
    @MaxLength(36)
    CampaignID?: string;
        
    @Field({description: `Member receiving the email`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Subject?: string;
        
    @Field({description: `Date email was sent`}) 
    SentDate: Date;
        
    @Field({nullable: true, description: `Date email was delivered to inbox`}) 
    DeliveredDate?: Date;
        
    @Field({nullable: true, description: `Date email was first opened`}) 
    OpenedDate?: Date;
        
    @Field(() => Int, {nullable: true, description: `Total number of opens`}) 
    OpenCount?: number;
        
    @Field({nullable: true, description: `Date a link was first clicked`}) 
    ClickedDate?: Date;
        
    @Field(() => Int, {nullable: true, description: `Total number of clicks`}) 
    ClickCount?: number;
        
    @Field({nullable: true}) 
    BouncedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    BounceType?: string;
        
    @Field({nullable: true}) 
    BounceReason?: string;
        
    @Field({nullable: true}) 
    UnsubscribedDate?: Date;
        
    @Field({nullable: true}) 
    SpamReportedDate?: Date;
        
    @Field({description: `Email status: Queued, Sent, Delivered, Opened, Clicked, Bounced, Spam, Unsubscribed, or Failed`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ExternalMessageID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Template?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Campaign?: string;
        
    @Field(() => [AssociationDemoEmailClick_])
    AssociationDemoEmailClicks_EmailSendIDArray: AssociationDemoEmailClick_[]; // Link to AssociationDemoEmailClicks
    
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
    async AssociationDemoEmailSend(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEmailSend_ | null> {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailSends')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Sends', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEmailClick_])
    async AssociationDemoEmailClicks_EmailSendIDArray(@Root() associationdemoemailsend_: AssociationDemoEmailSend_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Clicks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailClicks')} WHERE ${provider.QuoteIdentifier('EmailSendID')}='${associationdemoemailsend_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Clicks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Template name for identification`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Email subject line (may contain merge fields)`}) 
    @MaxLength(500)
    Subject?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    FromName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    FromEmail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ReplyToEmail?: string;
        
    @Field({nullable: true, description: `HTML version of email body`}) 
    HtmlBody?: string;
        
    @Field({nullable: true, description: `Plain text version of email body`}) 
    TextBody?: string;
        
    @Field({nullable: true, description: `Template category (Welcome, Renewal, Event, Newsletter, etc.)`}) 
    @MaxLength(100)
    Category?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    PreviewText?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Tags?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoEmailSend_])
    AssociationDemoEmailSends_TemplateIDArray: AssociationDemoEmailSend_[]; // Link to AssociationDemoEmailSends
    
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
    async AssociationDemoEmailTemplate(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEmailTemplate_ | null> {
        this.CheckUserReadPermissions('Email Templates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailTemplates')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Templates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Templates', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEmailSend_])
    async AssociationDemoEmailSends_TemplateIDArray(@Root() associationdemoemailtemplate_: AssociationDemoEmailTemplate_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailSends')} WHERE ${provider.QuoteIdentifier('TemplateID')}='${associationdemoemailtemplate_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Course being taken`}) 
    @MaxLength(36)
    CourseID: string;
        
    @Field({description: `Member taking the course`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Date member enrolled`}) 
    EnrollmentDate: Date;
        
    @Field({nullable: true}) 
    StartDate?: Date;
        
    @Field({nullable: true}) 
    CompletionDate?: Date;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field({description: `Enrollment status: Enrolled, In Progress, Completed, Failed, Withdrawn, or Expired`}) 
    @MaxLength(20)
    Status: string;
        
    @Field(() => Int, {nullable: true, description: `Course completion progress (0-100%)`}) 
    ProgressPercentage?: number;
        
    @Field({nullable: true}) 
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
    @MaxLength(36)
    InvoiceID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCertificate_])
    AssociationDemoCertificates_EnrollmentIDArray: AssociationDemoCertificate_[]; // Link to AssociationDemoCertificates
    
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
    async AssociationDemoEnrollment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEnrollment_ | null> {
        this.CheckUserReadPermissions('Enrollments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEnrollments')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Enrollments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Enrollments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCertificate_])
    async AssociationDemoCertificates_EnrollmentIDArray(@Root() associationdemoenrollment_: AssociationDemoEnrollment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certificates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertificates')} WHERE ${provider.QuoteIdentifier('EnrollmentID')}='${associationdemoenrollment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certificates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Event being registered for`}) 
    @MaxLength(36)
    EventID: string;
        
    @Field({description: `Member registering for the event`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Date and time of registration`}) 
    RegistrationDate: Date;
        
    @Field({nullable: true, description: `Type of registration (Early Bird, Standard, Late, etc.)`}) 
    @MaxLength(50)
    RegistrationType?: string;
        
    @Field({description: `Registration status: Registered, Waitlisted, Attended, No Show, or Cancelled`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Time attendee checked in to the event`}) 
    CheckInTime?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    InvoiceID?: string;
        
    @Field(() => Boolean, {description: `Whether CEU credits were awarded`}) 
    CEUAwarded: boolean;
        
    @Field({nullable: true}) 
    CEUAwardedDate?: Date;
        
    @Field({nullable: true}) 
    CancellationDate?: Date;
        
    @Field({nullable: true}) 
    CancellationReason?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoEventRegistration(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEventRegistration_ | null> {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Registrations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Parent event`}) 
    @MaxLength(36)
    EventID: string;
        
    @Field({description: `Session name or title`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    StartTime: Date;
        
    @Field() 
    EndTime: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Room?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    SpeakerName?: string;
        
    @Field({nullable: true, description: `Session type (Keynote, Workshop, Panel, etc.)`}) 
    @MaxLength(50)
    SessionType?: string;
        
    @Field(() => Int, {nullable: true}) 
    Capacity?: number;
        
    @Field(() => Float, {nullable: true}) 
    CEUCredits?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
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
    async AssociationDemoEventSession(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEventSession_ | null> {
        this.CheckUserReadPermissions('Event Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEventSessions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Sessions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Event name or title`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({description: `Type of event: Conference, Webinar, Workshop, Chapter Meeting, Virtual Summit, or Networking`}) 
    @MaxLength(50)
    EventType: string;
        
    @Field({description: `Event start date and time`}) 
    StartDate: Date;
        
    @Field({description: `Event end date and time`}) 
    EndDate: Date;
        
    @Field({nullable: true, description: `Event timezone (e.g., America/New_York, America/Chicago)`}) 
    @MaxLength(50)
    Timezone?: string;
        
    @Field({nullable: true, description: `Physical location or address of event`}) 
    @MaxLength(255)
    Location?: string;
        
    @Field(() => Boolean, {description: `Whether event is held virtually`}) 
    IsVirtual: boolean;
        
    @Field({nullable: true, description: `Virtual platform used (Zoom, Teams, etc.)`}) 
    @MaxLength(100)
    VirtualPlatform?: string;
        
    @Field({nullable: true, description: `URL for virtual event meeting`}) 
    @MaxLength(500)
    MeetingURL?: string;
        
    @Field({nullable: true, description: `Associated chapter for chapter-specific events`}) 
    @MaxLength(36)
    ChapterID?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum number of attendees`}) 
    Capacity?: number;
        
    @Field({nullable: true, description: `Date when event registration opens`}) 
    RegistrationOpenDate?: Date;
        
    @Field({nullable: true, description: `Date when event registration closes`}) 
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
    @MaxLength(20)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoEventRegistration_])
    AssociationDemoEventRegistrations_EventIDArray: AssociationDemoEventRegistration_[]; // Link to AssociationDemoEventRegistrations
    
    @Field(() => [AssociationDemoEventSession_])
    AssociationDemoEventSessions_EventIDArray: AssociationDemoEventSession_[]; // Link to AssociationDemoEventSessions
    
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
    async AssociationDemoEvent(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoEvent_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEvents')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoEventRegistration_])
    async AssociationDemoEventRegistrations_EventIDArray(@Root() associationdemoevent_: AssociationDemoEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('EventID')}='${associationdemoevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEventSession_])
    async AssociationDemoEventSessions_EventIDArray(@Root() associationdemoevent_: AssociationDemoEvent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEventSessions')} WHERE ${provider.QuoteIdentifier('EventID')}='${associationdemoevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Sessions', rows, this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for Forum Categories
//****************************************************************************
@ObjectType()
export class AssociationDemoForumCategory_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentCategoryID?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Icon?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
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
    LastPostDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    LastPostAuthorID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentCategoryID?: string;
        
    @Field(() => [AssociationDemoForumCategory_])
    AssociationDemoForumCategories_ParentCategoryIDArray: AssociationDemoForumCategory_[]; // Link to AssociationDemoForumCategories
    
    @Field(() => [AssociationDemoForumThread_])
    AssociationDemoForumThreads_CategoryIDArray: AssociationDemoForumThread_[]; // Link to AssociationDemoForumThreads
    
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
    async AssociationDemoForumCategory(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumCategory_ | null> {
        this.CheckUserReadPermissions('Forum Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumCategories')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoForumCategory_])
    async AssociationDemoForumCategories_ParentCategoryIDArray(@Root() associationdemoforumcategory_: AssociationDemoForumCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumCategories')} WHERE ${provider.QuoteIdentifier('ParentCategoryID')}='${associationdemoforumcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumThread_])
    async AssociationDemoForumThreads_CategoryIDArray(@Root() associationdemoforumcategory_: AssociationDemoForumCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumThreads')} WHERE ${provider.QuoteIdentifier('CategoryID')}='${associationdemoforumcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PostID: string;
        
    @Field() 
    @MaxLength(36)
    ReportedByID: string;
        
    @Field() 
    ReportedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ReportReason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    ModerationStatus?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ModeratedByID?: string;
        
    @Field({nullable: true}) 
    ModeratedDate?: Date;
        
    @Field({nullable: true}) 
    ModeratorNotes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Action?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoForumModeration(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumModeration_ | null> {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumModerations')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Moderations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ThreadID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentPostID?: string;
        
    @Field() 
    @MaxLength(36)
    AuthorID: string;
        
    @Field() 
    Content: string;
        
    @Field() 
    PostedDate: Date;
        
    @Field({nullable: true}) 
    EditedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
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
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentPostID?: string;
        
    @Field(() => [AssociationDemoForumModeration_])
    AssociationDemoForumModerations_PostIDArray: AssociationDemoForumModeration_[]; // Link to AssociationDemoForumModerations
    
    @Field(() => [AssociationDemoForumPost_])
    AssociationDemoForumPosts_ParentPostIDArray: AssociationDemoForumPost_[]; // Link to AssociationDemoForumPosts
    
    @Field(() => [AssociationDemoPostReaction_])
    AssociationDemoPostReactions_PostIDArray: AssociationDemoPostReaction_[]; // Link to AssociationDemoPostReactions
    
    @Field(() => [AssociationDemoPostTag_])
    AssociationDemoPostTags_PostIDArray: AssociationDemoPostTag_[]; // Link to AssociationDemoPostTags
    
    @Field(() => [AssociationDemoPostAttachment_])
    AssociationDemoPostAttachments_PostIDArray: AssociationDemoPostAttachment_[]; // Link to AssociationDemoPostAttachments
    
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
    async AssociationDemoForumPost(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumPost_ | null> {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumPosts')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Posts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoForumModeration_])
    async AssociationDemoForumModerations_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumModerations')} WHERE ${provider.QuoteIdentifier('PostID')}='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Moderations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumPost_])
    async AssociationDemoForumPosts_ParentPostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumPosts')} WHERE ${provider.QuoteIdentifier('ParentPostID')}='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostReaction_])
    async AssociationDemoPostReactions_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Reactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostReactions')} WHERE ${provider.QuoteIdentifier('PostID')}='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Reactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Reactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostTag_])
    async AssociationDemoPostTags_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostTags')} WHERE ${provider.QuoteIdentifier('PostID')}='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostAttachment_])
    async AssociationDemoPostAttachments_PostIDArray(@Root() associationdemoforumpost_: AssociationDemoForumPost_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostAttachments')} WHERE ${provider.QuoteIdentifier('PostID')}='${associationdemoforumpost_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Attachments', rows, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CategoryID: string;
        
    @Field() 
    @MaxLength(500)
    Title: string;
        
    @Field() 
    @MaxLength(36)
    AuthorID: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field(() => Int, {nullable: true}) 
    ViewCount?: number;
        
    @Field(() => Int, {nullable: true}) 
    ReplyCount?: number;
        
    @Field({nullable: true}) 
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    LastReplyAuthorID?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPinned?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsLocked?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsFeatured?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Category: string;
        
    @Field(() => [AssociationDemoForumPost_])
    AssociationDemoForumPosts_ThreadIDArray: AssociationDemoForumPost_[]; // Link to AssociationDemoForumPosts
    
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
    async AssociationDemoForumThread(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoForumThread_ | null> {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumThreads')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Forum Threads', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoForumPost_])
    async AssociationDemoForumPosts_ThreadIDArray(@Root() associationdemoforumthread_: AssociationDemoForumThread_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumPosts')} WHERE ${provider.QuoteIdentifier('ThreadID')}='${associationdemoforumthread_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    LegislativeBodyID?: string;
        
    @Field() 
    @MaxLength(100)
    FirstName: string;
        
    @Field() 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Title?: string;
        
    @Field() 
    @MaxLength(50)
    ContactType: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Party?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    District?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Committee?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    OfficeAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Website?: string;
        
    @Field({nullable: true}) 
    TermStart?: Date;
        
    @Field({nullable: true}) 
    TermEnd?: Date;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    LegislativeBody?: string;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoAdvocacyAction_])
    AssociationDemoAdvocacyActions_GovernmentContactIDArray: AssociationDemoAdvocacyAction_[]; // Link to AssociationDemoAdvocacyActions
    
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
    async AssociationDemoGovernmentContact(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoGovernmentContact_ | null> {
        this.CheckUserReadPermissions('Government Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwGovernmentContacts')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Government Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Government Contacts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoAdvocacyAction_])
    async AssociationDemoAdvocacyActions_GovernmentContactIDArray(@Root() associationdemogovernmentcontact_: AssociationDemoGovernmentContact_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwAdvocacyActions')} WHERE ${provider.QuoteIdentifier('GovernmentContactID')}='${associationdemogovernmentcontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Parent invoice`}) 
    @MaxLength(36)
    InvoiceID: string;
        
    @Field({description: `Line item description`}) 
    @MaxLength(500)
    Description: string;
        
    @Field({description: `Type of item: Membership Dues, Event Registration, Course Enrollment, Merchandise, Donation, or Other`}) 
    @MaxLength(50)
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
    @MaxLength(100)
    RelatedEntityType?: string;
        
    @Field({nullable: true, description: `ID of related entity (EventID, CourseID, etc.)`}) 
    @MaxLength(36)
    RelatedEntityID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoInvoiceLineItem(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoInvoiceLineItem_ | null> {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwInvoiceLineItems')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Invoice Line Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Unique invoice number`}) 
    @MaxLength(50)
    InvoiceNumber: string;
        
    @Field({description: `Member being invoiced`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Date invoice was created`}) 
    InvoiceDate: Date;
        
    @Field({description: `Payment due date`}) 
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
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    PaymentTerms?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoPayment_])
    AssociationDemoPayments_InvoiceIDArray: AssociationDemoPayment_[]; // Link to AssociationDemoPayments
    
    @Field(() => [AssociationDemoInvoiceLineItem_])
    AssociationDemoInvoiceLineItems_InvoiceIDArray: AssociationDemoInvoiceLineItem_[]; // Link to AssociationDemoInvoiceLineItems
    
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
    async AssociationDemoInvoice(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoInvoice_ | null> {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwInvoices')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Invoices', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoPayment_])
    async AssociationDemoPayments_InvoiceIDArray(@Root() associationdemoinvoice_: AssociationDemoInvoice_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPayments')} WHERE ${provider.QuoteIdentifier('InvoiceID')}='${associationdemoinvoice_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoInvoiceLineItem_])
    async AssociationDemoInvoiceLineItems_InvoiceIDArray(@Root() associationdemoinvoice_: AssociationDemoInvoice_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoice Line Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwInvoiceLineItems')} WHERE ${provider.QuoteIdentifier('InvoiceID')}='${associationdemoinvoice_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoice Line Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoice Line Items', rows, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field() 
    @MaxLength(50)
    BodyType: string;
        
    @Field() 
    @MaxLength(20)
    Level: string;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Country?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    SessionSchedule?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoGovernmentContact_])
    AssociationDemoGovernmentContacts_LegislativeBodyIDArray: AssociationDemoGovernmentContact_[]; // Link to AssociationDemoGovernmentContacts
    
    @Field(() => [AssociationDemoLegislativeIssue_])
    AssociationDemoLegislativeIssues_LegislativeBodyIDArray: AssociationDemoLegislativeIssue_[]; // Link to AssociationDemoLegislativeIssues
    
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
    async AssociationDemoLegislativeBody(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoLegislativeBody_ | null> {
        this.CheckUserReadPermissions('Legislative Bodies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwLegislativeBodies')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Legislative Bodies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Legislative Bodies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoGovernmentContact_])
    async AssociationDemoGovernmentContacts_LegislativeBodyIDArray(@Root() associationdemolegislativebody_: AssociationDemoLegislativeBody_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Government Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwGovernmentContacts')} WHERE ${provider.QuoteIdentifier('LegislativeBodyID')}='${associationdemolegislativebody_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Government Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Government Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoLegislativeIssue_])
    async AssociationDemoLegislativeIssues_LegislativeBodyIDArray(@Root() associationdemolegislativebody_: AssociationDemoLegislativeBody_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Legislative Issues', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwLegislativeIssues')} WHERE ${provider.QuoteIdentifier('LegislativeBodyID')}='${associationdemolegislativebody_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Legislative Issues', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    LegislativeBodyID: string;
        
    @Field() 
    @MaxLength(500)
    Title: string;
        
    @Field() 
    @MaxLength(50)
    IssueType: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    BillNumber?: string;
        
    @Field() 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true}) 
    IntroducedDate?: Date;
        
    @Field({nullable: true}) 
    LastActionDate?: Date;
        
    @Field({nullable: true}) 
    EffectiveDate?: Date;
        
    @Field({nullable: true}) 
    Summary?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    ImpactLevel?: string;
        
    @Field({nullable: true}) 
    ImpactDescription?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Category?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Sponsor?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    TrackingURL?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    LegislativeBody: string;
        
    @Field(() => [AssociationDemoAdvocacyAction_])
    AssociationDemoAdvocacyActions_LegislativeIssueIDArray: AssociationDemoAdvocacyAction_[]; // Link to AssociationDemoAdvocacyActions
    
    @Field(() => [AssociationDemoPolicyPosition_])
    AssociationDemoPolicyPositions_LegislativeIssueIDArray: AssociationDemoPolicyPosition_[]; // Link to AssociationDemoPolicyPositions
    
    @Field(() => [AssociationDemoRegulatoryComment_])
    AssociationDemoRegulatoryComments_LegislativeIssueIDArray: AssociationDemoRegulatoryComment_[]; // Link to AssociationDemoRegulatoryComments
    
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
    async AssociationDemoLegislativeIssue(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoLegislativeIssue_ | null> {
        this.CheckUserReadPermissions('Legislative Issues', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwLegislativeIssues')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Legislative Issues', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Legislative Issues', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoAdvocacyAction_])
    async AssociationDemoAdvocacyActions_LegislativeIssueIDArray(@Root() associationdemolegislativeissue_: AssociationDemoLegislativeIssue_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwAdvocacyActions')} WHERE ${provider.QuoteIdentifier('LegislativeIssueID')}='${associationdemolegislativeissue_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Advocacy Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPolicyPosition_])
    async AssociationDemoPolicyPositions_LegislativeIssueIDArray(@Root() associationdemolegislativeissue_: AssociationDemoLegislativeIssue_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Policy Positions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPolicyPositions')} WHERE ${provider.QuoteIdentifier('LegislativeIssueID')}='${associationdemolegislativeissue_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Policy Positions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Policy Positions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoRegulatoryComment_])
    async AssociationDemoRegulatoryComments_LegislativeIssueIDArray(@Root() associationdemolegislativeissue_: AssociationDemoLegislativeIssue_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Regulatory Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwRegulatoryComments')} WHERE ${provider.QuoteIdentifier('LegislativeIssueID')}='${associationdemolegislativeissue_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Regulatory Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Regulatory Comments', rows, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FollowerID: string;
        
    @Field() 
    @MaxLength(50)
    FollowType: string;
        
    @Field() 
    @MaxLength(36)
    FollowedEntityID: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NotifyOnActivity?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoMemberFollow(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMemberFollow_ | null> {
        this.CheckUserReadPermissions('Member Follows', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMemberFollows')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Follows', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Follows', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Primary email address (unique)`}) 
    @MaxLength(255)
    Email: string;
        
    @Field({description: `Member first name`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Member last name`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true, description: `Job title`}) 
    @MaxLength(100)
    Title?: string;
        
    @Field({nullable: true, description: `Associated organization (if applicable)`}) 
    @MaxLength(36)
    OrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    JobFunction?: string;
        
    @Field(() => Int, {nullable: true}) 
    YearsInProfession?: number;
        
    @Field({description: `Date member joined the association`}) 
    JoinDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    LinkedInURL?: string;
        
    @Field({nullable: true}) 
    Bio?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    PreferredLanguage?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Timezone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Mobile?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    PostalCode?: string;
        
    @Field(() => Int, {nullable: true, description: `Calculated engagement score based on activity`}) 
    EngagementScore?: number;
        
    @Field({nullable: true}) 
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ProfilePhotoURL?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoCommittee_])
    AssociationDemoCommittees_ChairMemberIDArray: AssociationDemoCommittee_[]; // Link to AssociationDemoCommittees
    
    @Field(() => [AssociationDemoEmailSend_])
    AssociationDemoEmailSends_MemberIDArray: AssociationDemoEmailSend_[]; // Link to AssociationDemoEmailSends
    
    @Field(() => [AssociationDemoProduct_])
    AssociationDemoProducts_MemberIDArray: AssociationDemoProduct_[]; // Link to AssociationDemoProducts
    
    @Field(() => [AssociationDemoResource_])
    AssociationDemoResources_AuthorIDArray: AssociationDemoResource_[]; // Link to AssociationDemoResources
    
    @Field(() => [AssociationDemoMemberFollow_])
    AssociationDemoMemberFollows_FollowerIDArray: AssociationDemoMemberFollow_[]; // Link to AssociationDemoMemberFollows
    
    @Field(() => [AssociationDemoInvoice_])
    AssociationDemoInvoices_MemberIDArray: AssociationDemoInvoice_[]; // Link to AssociationDemoInvoices
    
    @Field(() => [AssociationDemoBoardMember_])
    AssociationDemoBoardMembers_MemberIDArray: AssociationDemoBoardMember_[]; // Link to AssociationDemoBoardMembers
    
    @Field(() => [AssociationDemoResourceDownload_])
    AssociationDemoResourceDownloads_MemberIDArray: AssociationDemoResourceDownload_[]; // Link to AssociationDemoResourceDownloads
    
    @Field(() => [AssociationDemoChapterOfficer_])
    AssociationDemoChapterOfficers_MemberIDArray: AssociationDemoChapterOfficer_[]; // Link to AssociationDemoChapterOfficers
    
    @Field(() => [AssociationDemoCertification_])
    AssociationDemoCertifications_MemberIDArray: AssociationDemoCertification_[]; // Link to AssociationDemoCertifications
    
    @Field(() => [AssociationDemoForumModeration_])
    AssociationDemoForumModerations_ModeratedByIDArray: AssociationDemoForumModeration_[]; // Link to AssociationDemoForumModerations
    
    @Field(() => [AssociationDemoForumThread_])
    AssociationDemoForumThreads_LastReplyAuthorIDArray: AssociationDemoForumThread_[]; // Link to AssociationDemoForumThreads
    
    @Field(() => [AssociationDemoCompetitionJudge_])
    AssociationDemoCompetitionJudges_MemberIDArray: AssociationDemoCompetitionJudge_[]; // Link to AssociationDemoCompetitionJudges
    
    @Field(() => [AssociationDemoContinuingEducation_])
    AssociationDemoContinuingEducations_MemberIDArray: AssociationDemoContinuingEducation_[]; // Link to AssociationDemoContinuingEducations
    
    @Field(() => [AssociationDemoCampaignMember_])
    AssociationDemoCampaignMembers_MemberIDArray: AssociationDemoCampaignMember_[]; // Link to AssociationDemoCampaignMembers
    
    @Field(() => [AssociationDemoPostAttachment_])
    AssociationDemoPostAttachments_UploadedByIDArray: AssociationDemoPostAttachment_[]; // Link to AssociationDemoPostAttachments
    
    @Field(() => [AssociationDemoPostReaction_])
    AssociationDemoPostReactions_MemberIDArray: AssociationDemoPostReaction_[]; // Link to AssociationDemoPostReactions
    
    @Field(() => [AssociationDemoForumCategory_])
    AssociationDemoForumCategories_LastPostAuthorIDArray: AssociationDemoForumCategory_[]; // Link to AssociationDemoForumCategories
    
    @Field(() => [AssociationDemoMembership_])
    AssociationDemoMemberships_MemberIDArray: AssociationDemoMembership_[]; // Link to AssociationDemoMemberships
    
    @Field(() => [AssociationDemoResourceRating_])
    AssociationDemoResourceRatings_MemberIDArray: AssociationDemoResourceRating_[]; // Link to AssociationDemoResourceRatings
    
    @Field(() => [AssociationDemoAdvocacyAction_])
    AssociationDemoAdvocacyActions_MemberIDArray: AssociationDemoAdvocacyAction_[]; // Link to AssociationDemoAdvocacyActions
    
    @Field(() => [AssociationDemoChapterMembership_])
    AssociationDemoChapterMemberships_MemberIDArray: AssociationDemoChapterMembership_[]; // Link to AssociationDemoChapterMemberships
    
    @Field(() => [AssociationDemoEnrollment_])
    AssociationDemoEnrollments_MemberIDArray: AssociationDemoEnrollment_[]; // Link to AssociationDemoEnrollments
    
    @Field(() => [AssociationDemoEventRegistration_])
    AssociationDemoEventRegistrations_MemberIDArray: AssociationDemoEventRegistration_[]; // Link to AssociationDemoEventRegistrations
    
    @Field(() => [AssociationDemoResourceVersion_])
    AssociationDemoResourceVersions_CreatedByIDArray: AssociationDemoResourceVersion_[]; // Link to AssociationDemoResourceVersions
    
    @Field(() => [AssociationDemoCommitteeMembership_])
    AssociationDemoCommitteeMemberships_MemberIDArray: AssociationDemoCommitteeMembership_[]; // Link to AssociationDemoCommitteeMemberships
    
    @Field(() => [AssociationDemoForumPost_])
    AssociationDemoForumPosts_EditedByIDArray: AssociationDemoForumPost_[]; // Link to AssociationDemoForumPosts
    
    @Field(() => [AssociationDemoForumModeration_])
    AssociationDemoForumModerations_ReportedByIDArray: AssociationDemoForumModeration_[]; // Link to AssociationDemoForumModerations
    
    @Field(() => [AssociationDemoForumThread_])
    AssociationDemoForumThreads_AuthorIDArray: AssociationDemoForumThread_[]; // Link to AssociationDemoForumThreads
    
    @Field(() => [AssociationDemoForumPost_])
    AssociationDemoForumPosts_AuthorIDArray: AssociationDemoForumPost_[]; // Link to AssociationDemoForumPosts
    
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
    async AssociationDemoMember(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMember_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMembers')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Members', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCommittee_])
    async AssociationDemoCommittees_ChairMemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCommittees')} WHERE ${provider.QuoteIdentifier('ChairMemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEmailSend_])
    async AssociationDemoEmailSends_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Sends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEmailSends')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Email Sends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Sends', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProduct_])
    async AssociationDemoProducts_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProducts')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResource_])
    async AssociationDemoResources_AuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resources', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResources')} WHERE ${provider.QuoteIdentifier('AuthorID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resources', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resources', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoMemberFollow_])
    async AssociationDemoMemberFollows_FollowerIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Follows', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMemberFollows')} WHERE ${provider.QuoteIdentifier('FollowerID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Follows', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Follows', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoInvoice_])
    async AssociationDemoInvoices_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwInvoices')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Invoices', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoBoardMember_])
    async AssociationDemoBoardMembers_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Board Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwBoardMembers')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Board Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Board Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceDownload_])
    async AssociationDemoResourceDownloads_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Downloads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceDownloads')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Downloads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Downloads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoChapterOfficer_])
    async AssociationDemoChapterOfficers_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Officers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapterOfficers')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Officers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Officers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCertification_])
    async AssociationDemoCertifications_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCertifications')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Certifications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumModeration_])
    async AssociationDemoForumModerations_ModeratedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumModerations')} WHERE ${provider.QuoteIdentifier('ModeratedByID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Moderations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumThread_])
    async AssociationDemoForumThreads_LastReplyAuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumThreads')} WHERE ${provider.QuoteIdentifier('LastReplyAuthorID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Threads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCompetitionJudge_])
    async AssociationDemoCompetitionJudges_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Judges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionJudges')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Judges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Judges', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoContinuingEducation_])
    async AssociationDemoContinuingEducations_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Continuing Educations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwContinuingEducations')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Continuing Educations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Continuing Educations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCampaignMember_])
    async AssociationDemoCampaignMembers_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCampaignMembers')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Campaign Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostAttachment_])
    async AssociationDemoPostAttachments_UploadedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostAttachments')} WHERE ${provider.QuoteIdentifier('UploadedByID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Attachments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoPostReaction_])
    async AssociationDemoPostReactions_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Post Reactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostReactions')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Reactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Post Reactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumCategory_])
    async AssociationDemoForumCategories_LastPostAuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumCategories')} WHERE ${provider.QuoteIdentifier('LastPostAuthorID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoMembership_])
    async AssociationDemoMemberships_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceRating_])
    async AssociationDemoResourceRatings_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Ratings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceRatings')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Ratings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Ratings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoAdvocacyAction_])
    async AssociationDemoAdvocacyActions_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Advocacy Actions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwAdvocacyActions')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Advocacy Actions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Advocacy Actions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoChapterMembership_])
    async AssociationDemoChapterMemberships_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Chapter Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwChapterMemberships')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Chapter Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Chapter Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEnrollment_])
    async AssociationDemoEnrollments_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Enrollments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEnrollments')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Enrollments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Enrollments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoEventRegistration_])
    async AssociationDemoEventRegistrations_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwEventRegistrations')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceVersion_])
    async AssociationDemoResourceVersions_CreatedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceVersions')} WHERE ${provider.QuoteIdentifier('CreatedByID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Versions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCommitteeMembership_])
    async AssociationDemoCommitteeMemberships_MemberIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCommitteeMemberships')} WHERE ${provider.QuoteIdentifier('MemberID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Committee Memberships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumPost_])
    async AssociationDemoForumPosts_EditedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumPosts')} WHERE ${provider.QuoteIdentifier('EditedByID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumModeration_])
    async AssociationDemoForumModerations_ReportedByIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Moderations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumModerations')} WHERE ${provider.QuoteIdentifier('ReportedByID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Moderations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Moderations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumThread_])
    async AssociationDemoForumThreads_AuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Threads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumThreads')} WHERE ${provider.QuoteIdentifier('AuthorID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Threads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Threads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoForumPost_])
    async AssociationDemoForumPosts_AuthorIDArray(@Root() associationdemomember_: AssociationDemoMember_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Forum Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwForumPosts')} WHERE ${provider.QuoteIdentifier('AuthorID')}='${associationdemomember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Forum Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Forum Posts', rows, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Name of membership type (e.g., Individual, Corporate, Student)`}) 
    @MaxLength(100)
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
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoMembership_])
    AssociationDemoMemberships_MembershipTypeIDArray: AssociationDemoMembership_[]; // Link to AssociationDemoMemberships
    
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
    async AssociationDemoMembershipType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMembershipType_ | null> {
        this.CheckUserReadPermissions('Membership Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMembershipTypes')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Membership Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoMembership_])
    async AssociationDemoMemberships_MembershipTypeIDArray(@Root() associationdemomembershiptype_: AssociationDemoMembershipType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('MembershipTypeID')}='${associationdemomembershiptype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Member who holds this membership`}) 
    @MaxLength(36)
    MemberID: string;
        
    @Field({description: `Type of membership`}) 
    @MaxLength(36)
    MembershipTypeID: string;
        
    @Field({description: `Current status: Active, Pending, Lapsed, Suspended, or Cancelled`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({description: `Membership start date`}) 
    StartDate: Date;
        
    @Field({description: `Membership end/expiration date`}) 
    EndDate: Date;
        
    @Field({nullable: true}) 
    RenewalDate?: Date;
        
    @Field(() => Boolean, {description: `Whether membership will automatically renew`}) 
    AutoRenew: boolean;
        
    @Field({nullable: true}) 
    CancellationDate?: Date;
        
    @Field({nullable: true}) 
    CancellationReason?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
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
    async AssociationDemoMembership(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoMembership_ | null> {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMemberships')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Memberships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Company or organization name`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Primary industry or sector`}) 
    @MaxLength(100)
    Industry?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of employees`}) 
    EmployeeCount?: number;
        
    @Field(() => Float, {nullable: true, description: `Annual revenue in USD`}) 
    AnnualRevenue?: number;
        
    @Field(() => Float, {nullable: true, description: `Market capitalization in USD (for public companies)`}) 
    MarketCapitalization?: number;
        
    @Field({nullable: true, description: `Stock ticker symbol (for public companies)`}) 
    @MaxLength(10)
    TickerSymbol?: string;
        
    @Field({nullable: true, description: `Stock exchange (NYSE, NASDAQ, etc. for public companies)`}) 
    @MaxLength(50)
    Exchange?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Website?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Int, {nullable: true}) 
    YearFounded?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    PostalCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    LogoURL?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [AssociationDemoMember_])
    AssociationDemoMembers_OrganizationIDArray: AssociationDemoMember_[]; // Link to AssociationDemoMembers
    
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
    async AssociationDemoOrganization(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoOrganization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Organizations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoMember_])
    async AssociationDemoMembers_OrganizationIDArray(@Root() associationdemoorganization_: AssociationDemoOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwMembers')} WHERE ${provider.QuoteIdentifier('OrganizationID')}='${associationdemoorganization_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Invoice being paid`}) 
    @MaxLength(36)
    InvoiceID: string;
        
    @Field({description: `Date payment was initiated`}) 
    PaymentDate: Date;
        
    @Field(() => Float, {description: `Payment amount`}) 
    Amount: number;
        
    @Field({description: `Payment method: Credit Card, ACH, Check, Wire, PayPal, Stripe, or Cash`}) 
    @MaxLength(50)
    PaymentMethod: string;
        
    @Field({nullable: true, description: `External payment provider transaction ID`}) 
    @MaxLength(255)
    TransactionID?: string;
        
    @Field({description: `Payment status: Pending, Completed, Failed, Refunded, or Cancelled`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    ProcessedDate?: Date;
        
    @Field({nullable: true}) 
    FailureReason?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoPayment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPayment_ | null> {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPayments')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Payments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    LegislativeIssueID: string;
        
    @Field() 
    @MaxLength(30)
    Position: string;
        
    @Field() 
    PositionStatement: string;
        
    @Field({nullable: true}) 
    Rationale?: string;
        
    @Field() 
    AdoptedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AdoptedBy?: string;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Priority?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPublic?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    DocumentURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ContactPerson?: string;
        
    @Field({nullable: true}) 
    LastReviewedDate?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoPolicyPosition(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPolicyPosition_ | null> {
        this.CheckUserReadPermissions('Policy Positions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPolicyPositions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Policy Positions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Policy Positions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PostID: string;
        
    @Field() 
    @MaxLength(255)
    FileName: string;
        
    @Field() 
    @MaxLength(1000)
    FileURL: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FileType?: string;
        
    @Field(() => Int, {nullable: true}) 
    FileSizeBytes?: number;
        
    @Field() 
    UploadedDate: Date;
        
    @Field() 
    @MaxLength(36)
    UploadedByID: string;
        
    @Field(() => Int, {nullable: true}) 
    DownloadCount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoPostAttachment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPostAttachment_ | null> {
        this.CheckUserReadPermissions('Post Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostAttachments')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Post Attachments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PostID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field() 
    @MaxLength(50)
    ReactionType: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoPostReaction(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPostReaction_ | null> {
        this.CheckUserReadPermissions('Post Reactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostReactions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Reactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Post Reactions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PostID: string;
        
    @Field() 
    @MaxLength(100)
    TagName: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoPostTag(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoPostTag_ | null> {
        this.CheckUserReadPermissions('Post Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwPostTags')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Post Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Post Tags', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CompetitionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CompetitionEntryID?: string;
        
    @Field() 
    @MaxLength(255)
    AwardName: string;
        
    @Field() 
    @MaxLength(100)
    AwardLevel: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AwardingOrganization?: string;
        
    @Field() 
    AwardDate: Date;
        
    @Field(() => Int) 
    Year: number;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Category?: string;
        
    @Field(() => Float, {nullable: true}) 
    Score?: number;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    CertificateURL?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDisplayed?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Product: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
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
    async AssociationDemoProductAward(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoProductAward_ | null> {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProductAwards')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Product Awards', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentCategoryID?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ImageURL?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentCategoryID?: string;
        
    @Field(() => [AssociationDemoProductCategory_])
    AssociationDemoProductCategories_ParentCategoryIDArray: AssociationDemoProductCategory_[]; // Link to AssociationDemoProductCategories
    
    @Field(() => [AssociationDemoProduct_])
    AssociationDemoProducts_CategoryIDArray: AssociationDemoProduct_[]; // Link to AssociationDemoProducts
    
    @Field(() => [AssociationDemoCompetitionEntry_])
    AssociationDemoCompetitionEntries_CategoryIDArray: AssociationDemoCompetitionEntry_[]; // Link to AssociationDemoCompetitionEntries
    
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
    async AssociationDemoProductCategory(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoProductCategory_ | null> {
        this.CheckUserReadPermissions('Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProductCategories')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Product Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoProductCategory_])
    async AssociationDemoProductCategories_ParentCategoryIDArray(@Root() associationdemoproductcategory_: AssociationDemoProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProductCategories')} WHERE ${provider.QuoteIdentifier('ParentCategoryID')}='${associationdemoproductcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Product Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProduct_])
    async AssociationDemoProducts_CategoryIDArray(@Root() associationdemoproductcategory_: AssociationDemoProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProducts')} WHERE ${provider.QuoteIdentifier('CategoryID')}='${associationdemoproductcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoCompetitionEntry_])
    async AssociationDemoCompetitionEntries_CategoryIDArray(@Root() associationdemoproductcategory_: AssociationDemoProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionEntries')} WHERE ${provider.QuoteIdentifier('CategoryID')}='${associationdemoproductcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field() 
    @MaxLength(36)
    CategoryID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    CheeseType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    MilkSource?: string;
        
    @Field(() => Int, {nullable: true}) 
    AgeMonths?: number;
        
    @Field(() => Float, {nullable: true}) 
    Weight?: number;
        
    @Field({nullable: true}) 
    @MaxLength(20)
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
    DateIntroduced?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
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
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Category: string;
        
    @Field(() => [AssociationDemoCompetitionEntry_])
    AssociationDemoCompetitionEntries_ProductIDArray: AssociationDemoCompetitionEntry_[]; // Link to AssociationDemoCompetitionEntries
    
    @Field(() => [AssociationDemoProductAward_])
    AssociationDemoProductAwards_ProductIDArray: AssociationDemoProductAward_[]; // Link to AssociationDemoProductAwards
    
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
    async AssociationDemoProduct(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoProduct_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProducts')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCompetitionEntry_])
    async AssociationDemoCompetitionEntries_ProductIDArray(@Root() associationdemoproduct_: AssociationDemoProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Competition Entries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCompetitionEntries')} WHERE ${provider.QuoteIdentifier('ProductID')}='${associationdemoproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Competition Entries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Competition Entries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoProductAward_])
    async AssociationDemoProductAwards_ProductIDArray(@Root() associationdemoproduct_: AssociationDemoProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Product Awards', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwProductAwards')} WHERE ${provider.QuoteIdentifier('ProductID')}='${associationdemoproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Product Awards', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    LegislativeIssueID: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    DocketNumber?: string;
        
    @Field({nullable: true}) 
    CommentPeriodStart?: Date;
        
    @Field({nullable: true}) 
    CommentPeriodEnd?: Date;
        
    @Field() 
    SubmittedDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    SubmittedBy?: string;
        
    @Field() 
    CommentText: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    CommentType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    AttachmentURL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ConfirmationNumber?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Status?: string;
        
    @Field({nullable: true}) 
    Response?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoRegulatoryComment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoRegulatoryComment_ | null> {
        this.CheckUserReadPermissions('Regulatory Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwRegulatoryComments')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Regulatory Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Regulatory Comments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentCategoryID?: string;
        
    @Field(() => Int, {nullable: true}) 
    DisplayOrder?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Icon?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Color?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    RequiresMembership?: boolean;
        
    @Field(() => Int, {nullable: true}) 
    ResourceCount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentCategoryID?: string;
        
    @Field(() => [AssociationDemoResourceCategory_])
    AssociationDemoResourceCategories_ParentCategoryIDArray: AssociationDemoResourceCategory_[]; // Link to AssociationDemoResourceCategories
    
    @Field(() => [AssociationDemoResource_])
    AssociationDemoResources_CategoryIDArray: AssociationDemoResource_[]; // Link to AssociationDemoResources
    
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
    async AssociationDemoResourceCategory(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceCategory_ | null> {
        this.CheckUserReadPermissions('Resource Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceCategories')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoResourceCategory_])
    async AssociationDemoResourceCategories_ParentCategoryIDArray(@Root() associationdemoresourcecategory_: AssociationDemoResourceCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceCategories')} WHERE ${provider.QuoteIdentifier('ParentCategoryID')}='${associationdemoresourcecategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResource_])
    async AssociationDemoResources_CategoryIDArray(@Root() associationdemoresourcecategory_: AssociationDemoResourceCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resources', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResources')} WHERE ${provider.QuoteIdentifier('CategoryID')}='${associationdemoresourcecategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resources', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ResourceID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field() 
    DownloadDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    IPAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    UserAgent?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoResourceDownload(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceDownload_ | null> {
        this.CheckUserReadPermissions('Resource Downloads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceDownloads')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Downloads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Downloads', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ResourceID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field(() => Int) 
    Rating: number;
        
    @Field({nullable: true}) 
    Review?: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsHelpful?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoResourceRating(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceRating_ | null> {
        this.CheckUserReadPermissions('Resource Ratings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceRatings')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Ratings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Ratings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ResourceID: string;
        
    @Field() 
    @MaxLength(100)
    TagName: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoResourceTag(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceTag_ | null> {
        this.CheckUserReadPermissions('Resource Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceTags')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Tags', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ResourceID: string;
        
    @Field() 
    @MaxLength(20)
    VersionNumber: string;
        
    @Field({nullable: true}) 
    VersionNotes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    FileURL?: string;
        
    @Field(() => Int, {nullable: true}) 
    FileSizeBytes?: number;
        
    @Field() 
    @MaxLength(36)
    CreatedByID: string;
        
    @Field() 
    CreatedDate: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsCurrent?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
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
    async AssociationDemoResourceVersion(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResourceVersion_ | null> {
        this.CheckUserReadPermissions('Resource Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceVersions')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resource Versions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CategoryID: string;
        
    @Field() 
    @MaxLength(500)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(50)
    ResourceType: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    FileURL?: string;
        
    @Field(() => Int, {nullable: true}) 
    FileSizeBytes?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    MimeType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AuthorID?: string;
        
    @Field() 
    PublishedDate: Date;
        
    @Field({nullable: true}) 
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
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Category: string;
        
    @Field(() => [AssociationDemoResourceDownload_])
    AssociationDemoResourceDownloads_ResourceIDArray: AssociationDemoResourceDownload_[]; // Link to AssociationDemoResourceDownloads
    
    @Field(() => [AssociationDemoResourceRating_])
    AssociationDemoResourceRatings_ResourceIDArray: AssociationDemoResourceRating_[]; // Link to AssociationDemoResourceRatings
    
    @Field(() => [AssociationDemoResourceTag_])
    AssociationDemoResourceTags_ResourceIDArray: AssociationDemoResourceTag_[]; // Link to AssociationDemoResourceTags
    
    @Field(() => [AssociationDemoResourceVersion_])
    AssociationDemoResourceVersions_ResourceIDArray: AssociationDemoResourceVersion_[]; // Link to AssociationDemoResourceVersions
    
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
    async AssociationDemoResource(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoResource_ | null> {
        this.CheckUserReadPermissions('Resources', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResources')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resources', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Resources', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoResourceDownload_])
    async AssociationDemoResourceDownloads_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Downloads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceDownloads')} WHERE ${provider.QuoteIdentifier('ResourceID')}='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Downloads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Downloads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceRating_])
    async AssociationDemoResourceRatings_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Ratings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceRatings')} WHERE ${provider.QuoteIdentifier('ResourceID')}='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Ratings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Ratings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceTag_])
    async AssociationDemoResourceTags_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceTags')} WHERE ${provider.QuoteIdentifier('ResourceID')}='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Resource Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AssociationDemoResourceVersion_])
    async AssociationDemoResourceVersions_ResourceIDArray(@Root() associationdemoresource_: AssociationDemoResource_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwResourceVersions')} WHERE ${provider.QuoteIdentifier('ResourceID')}='${associationdemoresource_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Resource Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Segment name`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true, description: `Segment type (Industry, Geography, Engagement, Membership Type, etc.)`}) 
    @MaxLength(50)
    SegmentType?: string;
        
    @Field({nullable: true, description: `Filter criteria (JSON or SQL WHERE clause)`}) 
    FilterCriteria?: string;
        
    @Field(() => Int, {nullable: true, description: `Number of members matching this segment`}) 
    MemberCount?: number;
        
    @Field({nullable: true}) 
    LastCalculatedDate?: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [AssociationDemoCampaignMember_])
    AssociationDemoCampaignMembers_SegmentIDArray: AssociationDemoCampaignMember_[]; // Link to AssociationDemoCampaignMembers
    
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
    async AssociationDemoSegment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AssociationDemoSegment_ | null> {
        this.CheckUserReadPermissions('Segments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwSegments')} WHERE ${provider.QuoteIdentifier('ID')}='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Segments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Segments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AssociationDemoCampaignMember_])
    async AssociationDemoCampaignMembers_SegmentIDArray(@Root() associationdemosegment_: AssociationDemoSegment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Campaign Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('AssociationDemo', 'vwCampaignMembers')} WHERE ${provider.QuoteIdentifier('SegmentID')}='${associationdemosegment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaign Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
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