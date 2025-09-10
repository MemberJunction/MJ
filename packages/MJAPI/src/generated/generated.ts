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


import { ContentEntity, TargettedReviewerRecruitmentEmailEntity, ContributorEntity, ContributorContentEntity, FullRandomReviewerListEntity, TargetListEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Contents
//****************************************************************************
@ObjectType()
export class Content_ {
    @Field(() => Float) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    SourceID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Source?: string;
        
    @Field(() => Float, {nullable: true}) 
    ContentID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ContentType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2000)
    Title?: string;
        
    @Field({nullable: true}) 
    Text?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    DOI?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2000)
    URL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    Date?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    EmbeddingID?: string;
        
    @Field(() => Float, {nullable: true}) 
    UpdateVector?: number;
        
    @Field(() => Float, {nullable: true}) 
    IsError?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Metadata?: string;
        
}

//****************************************************************************
// INPUT TYPE for Contents
//****************************************************************************
@InputType()
export class CreateContentInput {
    @Field(() => Float, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    SourceID: string | null;

    @Field({ nullable: true })
    Source: string | null;

    @Field(() => Float, { nullable: true })
    ContentID: number | null;

    @Field({ nullable: true })
    ContentType: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Text: string | null;

    @Field({ nullable: true })
    DOI: string | null;

    @Field({ nullable: true })
    URL: string | null;

    @Field({ nullable: true })
    Date: Date | null;

    @Field({ nullable: true })
    EmbeddingID: string | null;

    @Field(() => Float, { nullable: true })
    UpdateVector: number | null;

    @Field(() => Float, { nullable: true })
    IsError: number | null;

    @Field({ nullable: true })
    Metadata: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Contents
//****************************************************************************
@InputType()
export class UpdateContentInput {
    @Field(() => Float)
    ID: number;

    @Field({ nullable: true })
    SourceID?: string | null;

    @Field({ nullable: true })
    Source?: string | null;

    @Field(() => Float, { nullable: true })
    ContentID?: number | null;

    @Field({ nullable: true })
    ContentType?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Text?: string | null;

    @Field({ nullable: true })
    DOI?: string | null;

    @Field({ nullable: true })
    URL?: string | null;

    @Field({ nullable: true })
    Date?: Date | null;

    @Field({ nullable: true })
    EmbeddingID?: string | null;

    @Field(() => Float, { nullable: true })
    UpdateVector?: number | null;

    @Field(() => Float, { nullable: true })
    IsError?: number | null;

    @Field({ nullable: true })
    Metadata?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contents
//****************************************************************************
@ObjectType()
export class RunContentViewResult {
    @Field(() => [Content_])
    Results: Content_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Content_)
export class ContentResolver extends ResolverBase {
    @Query(() => RunContentViewResult)
    async RunContentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContentViewResult)
    async RunContentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContentViewResult)
    async RunContentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contents';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Content_, { nullable: true })
    async Content(@Arg('ID', () => Float) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Content_ | null> {
        this.CheckUserReadPermissions('Contents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dbo].[vwContents] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contents', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Content_)
    async CreateContent(
        @Arg('input', () => CreateContentInput) input: CreateContentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contents', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Content_)
    async UpdateContent(
        @Arg('input', () => UpdateContentInput) input: UpdateContentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contents', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Content_)
    async DeleteContent(@Arg('ID', () => Float) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contents', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Targetted Reviewer Recruitment Emails
//****************************************************************************
@ObjectType()
export class TargettedReviewerRecruitmentEmail_ {
    @Field() 
    @MaxLength(510)
    CustomerID: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1020)
    Affiliation?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Targetted Reviewer Recruitment Emails
//****************************************************************************
@InputType()
export class CreateTargettedReviewerRecruitmentEmailInput {
    @Field({ nullable: true })
    CustomerID?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Affiliation: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Targetted Reviewer Recruitment Emails
//****************************************************************************
@InputType()
export class UpdateTargettedReviewerRecruitmentEmailInput {
    @Field()
    CustomerID: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Affiliation?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Targetted Reviewer Recruitment Emails
//****************************************************************************
@ObjectType()
export class RunTargettedReviewerRecruitmentEmailViewResult {
    @Field(() => [TargettedReviewerRecruitmentEmail_])
    Results: TargettedReviewerRecruitmentEmail_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(TargettedReviewerRecruitmentEmail_)
export class TargettedReviewerRecruitmentEmailResolver extends ResolverBase {
    @Query(() => RunTargettedReviewerRecruitmentEmailViewResult)
    async RunTargettedReviewerRecruitmentEmailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunTargettedReviewerRecruitmentEmailViewResult)
    async RunTargettedReviewerRecruitmentEmailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunTargettedReviewerRecruitmentEmailViewResult)
    async RunTargettedReviewerRecruitmentEmailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Targetted Reviewer Recruitment Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => TargettedReviewerRecruitmentEmail_, { nullable: true })
    async TargettedReviewerRecruitmentEmail(@Arg('CustomerID', () => String) CustomerID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<TargettedReviewerRecruitmentEmail_ | null> {
        this.CheckUserReadPermissions('Targetted Reviewer Recruitment Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dbo].[vwTargettedReviewerRecruitmentEmails] WHERE [CustomerID]='${CustomerID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Targetted Reviewer Recruitment Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Targetted Reviewer Recruitment Emails', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => TargettedReviewerRecruitmentEmail_)
    async CreateTargettedReviewerRecruitmentEmail(
        @Arg('input', () => CreateTargettedReviewerRecruitmentEmailInput) input: CreateTargettedReviewerRecruitmentEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Targetted Reviewer Recruitment Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => TargettedReviewerRecruitmentEmail_)
    async UpdateTargettedReviewerRecruitmentEmail(
        @Arg('input', () => UpdateTargettedReviewerRecruitmentEmailInput) input: UpdateTargettedReviewerRecruitmentEmailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Targetted Reviewer Recruitment Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => TargettedReviewerRecruitmentEmail_)
    async DeleteTargettedReviewerRecruitmentEmail(@Arg('CustomerID', () => String) CustomerID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CustomerID', Value: CustomerID}]);
        return this.DeleteRecord('Targetted Reviewer Recruitment Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contributors
//****************************************************************************
@ObjectType()
export class Contributor_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    CustomerID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Name?: string;
        
    @Field({nullable: true}) 
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    JobTitle?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    DoNotDisplay?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    EmbeddingID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    UpdateVector?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    IsError?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contributors
//****************************************************************************
@InputType()
export class CreateContributorInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    CustomerID: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    JobTitle: string | null;

    @Field({ nullable: true })
    DoNotDisplay: string | null;

    @Field({ nullable: true })
    EmbeddingID: string | null;

    @Field({ nullable: true })
    UpdateVector: string | null;

    @Field({ nullable: true })
    IsError: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Contributors
//****************************************************************************
@InputType()
export class UpdateContributorInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    CustomerID?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    JobTitle?: string | null;

    @Field({ nullable: true })
    DoNotDisplay?: string | null;

    @Field({ nullable: true })
    EmbeddingID?: string | null;

    @Field({ nullable: true })
    UpdateVector?: string | null;

    @Field({ nullable: true })
    IsError?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contributors
//****************************************************************************
@ObjectType()
export class RunContributorViewResult {
    @Field(() => [Contributor_])
    Results: Contributor_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Contributor_)
export class ContributorResolver extends ResolverBase {
    @Query(() => RunContributorViewResult)
    async RunContributorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContributorViewResult)
    async RunContributorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContributorViewResult)
    async RunContributorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contributors';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Contributor_, { nullable: true })
    async Contributor(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Contributor_ | null> {
        this.CheckUserReadPermissions('Contributors', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dbo].[vwContributors] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contributors', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contributors', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Contributor_)
    async CreateContributor(
        @Arg('input', () => CreateContributorInput) input: CreateContributorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contributors', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Contributor_)
    async UpdateContributor(
        @Arg('input', () => UpdateContributorInput) input: UpdateContributorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contributors', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Contributor_)
    async DeleteContributor(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contributors', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contributor Contents
//****************************************************************************
@ObjectType()
export class ContributorContent_ {
    @Field(() => Float) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    SourceID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Source?: string;
        
    @Field(() => Float, {nullable: true}) 
    ContributorID?: number;
        
    @Field(() => Float, {nullable: true}) 
    ContentID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    DOI?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Role1?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Role2?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    CorrespondingAuthor?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Affiliation?: string;
        
    @Field(() => Float, {nullable: true}) 
    Order?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contributor Contents
//****************************************************************************
@InputType()
export class CreateContributorContentInput {
    @Field(() => Float, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    SourceID: string | null;

    @Field({ nullable: true })
    Source: string | null;

    @Field(() => Float, { nullable: true })
    ContributorID: number | null;

    @Field(() => Float, { nullable: true })
    ContentID: number | null;

    @Field({ nullable: true })
    DOI: string | null;

    @Field({ nullable: true })
    Role1: string | null;

    @Field({ nullable: true })
    Role2: string | null;

    @Field({ nullable: true })
    CorrespondingAuthor: string | null;

    @Field({ nullable: true })
    Affiliation: string | null;

    @Field(() => Float, { nullable: true })
    Order: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Contributor Contents
//****************************************************************************
@InputType()
export class UpdateContributorContentInput {
    @Field(() => Float)
    ID: number;

    @Field({ nullable: true })
    SourceID?: string | null;

    @Field({ nullable: true })
    Source?: string | null;

    @Field(() => Float, { nullable: true })
    ContributorID?: number | null;

    @Field(() => Float, { nullable: true })
    ContentID?: number | null;

    @Field({ nullable: true })
    DOI?: string | null;

    @Field({ nullable: true })
    Role1?: string | null;

    @Field({ nullable: true })
    Role2?: string | null;

    @Field({ nullable: true })
    CorrespondingAuthor?: string | null;

    @Field({ nullable: true })
    Affiliation?: string | null;

    @Field(() => Float, { nullable: true })
    Order?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contributor Contents
//****************************************************************************
@ObjectType()
export class RunContributorContentViewResult {
    @Field(() => [ContributorContent_])
    Results: ContributorContent_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ContributorContent_)
export class ContributorContentResolver extends ResolverBase {
    @Query(() => RunContributorContentViewResult)
    async RunContributorContentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContributorContentViewResult)
    async RunContributorContentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContributorContentViewResult)
    async RunContributorContentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contributor Contents';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ContributorContent_, { nullable: true })
    async ContributorContent(@Arg('ID', () => Float) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContributorContent_ | null> {
        this.CheckUserReadPermissions('Contributor Contents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dbo].[vwContributorContents] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Contributor Contents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contributor Contents', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => ContributorContent_)
    async CreateContributorContent(
        @Arg('input', () => CreateContributorContentInput) input: CreateContributorContentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contributor Contents', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ContributorContent_)
    async UpdateContributorContent(
        @Arg('input', () => UpdateContributorContentInput) input: UpdateContributorContentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contributor Contents', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ContributorContent_)
    async DeleteContributorContent(@Arg('ID', () => Float) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contributor Contents', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Full Random Reviewer Lists
//****************************************************************************
@ObjectType()
export class FullRandomReviewerList_ {
    @Field() 
    @MaxLength(100)
    CustomerID: string;
        
    @Field() 
    @MaxLength(510)
    FirstName: string;
        
    @Field() 
    @MaxLength(510)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field() 
    @MaxLength(2000)
    Affiliation: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Full Random Reviewer Lists
//****************************************************************************
@InputType()
export class CreateFullRandomReviewerListInput {
    @Field({ nullable: true })
    CustomerID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Affiliation?: string;
}
    

//****************************************************************************
// INPUT TYPE for Full Random Reviewer Lists
//****************************************************************************
@InputType()
export class UpdateFullRandomReviewerListInput {
    @Field()
    CustomerID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Full Random Reviewer Lists
//****************************************************************************
@ObjectType()
export class RunFullRandomReviewerListViewResult {
    @Field(() => [FullRandomReviewerList_])
    Results: FullRandomReviewerList_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(FullRandomReviewerList_)
export class FullRandomReviewerListResolver extends ResolverBase {
    @Query(() => RunFullRandomReviewerListViewResult)
    async RunFullRandomReviewerListViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunFullRandomReviewerListViewResult)
    async RunFullRandomReviewerListViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunFullRandomReviewerListViewResult)
    async RunFullRandomReviewerListDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Full Random Reviewer Lists';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => FullRandomReviewerList_, { nullable: true })
    async FullRandomReviewerList(@Arg('CustomerID', () => String) CustomerID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<FullRandomReviewerList_ | null> {
        this.CheckUserReadPermissions('Full Random Reviewer Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dbo].[vwFullRandomReviewerLists] WHERE [CustomerID]='${CustomerID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Full Random Reviewer Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Full Random Reviewer Lists', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => FullRandomReviewerList_)
    async CreateFullRandomReviewerList(
        @Arg('input', () => CreateFullRandomReviewerListInput) input: CreateFullRandomReviewerListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Full Random Reviewer Lists', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => FullRandomReviewerList_)
    async UpdateFullRandomReviewerList(
        @Arg('input', () => UpdateFullRandomReviewerListInput) input: UpdateFullRandomReviewerListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Full Random Reviewer Lists', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => FullRandomReviewerList_)
    async DeleteFullRandomReviewerList(@Arg('CustomerID', () => String) CustomerID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CustomerID', Value: CustomerID}]);
        return this.DeleteRecord('Full Random Reviewer Lists', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Target Lists
//****************************************************************************
@ObjectType()
export class TargetList_ {
    @Field() 
    @MaxLength(510)
    CustomerID: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1020)
    Organization?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Target Lists
//****************************************************************************
@InputType()
export class CreateTargetListInput {
    @Field({ nullable: true })
    CustomerID?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Organization: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Target Lists
//****************************************************************************
@InputType()
export class UpdateTargetListInput {
    @Field()
    CustomerID: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Target Lists
//****************************************************************************
@ObjectType()
export class RunTargetListViewResult {
    @Field(() => [TargetList_])
    Results: TargetList_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(TargetList_)
export class TargetListResolver extends ResolverBase {
    @Query(() => RunTargetListViewResult)
    async RunTargetListViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunTargetListViewResult)
    async RunTargetListViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunTargetListViewResult)
    async RunTargetListDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Target Lists';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => TargetList_, { nullable: true })
    async TargetList(@Arg('CustomerID', () => String) CustomerID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<TargetList_ | null> {
        this.CheckUserReadPermissions('Target Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dbo].[vwTargetLists] WHERE [CustomerID]='${CustomerID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Target Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Target Lists', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => TargetList_)
    async CreateTargetList(
        @Arg('input', () => CreateTargetListInput) input: CreateTargetListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Target Lists', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => TargetList_)
    async UpdateTargetList(
        @Arg('input', () => UpdateTargetListInput) input: UpdateTargetListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Target Lists', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => TargetList_)
    async DeleteTargetList(@Arg('CustomerID', () => String) CustomerID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'CustomerID', Value: CustomerID}]);
        return this.DeleteRecord('Target Lists', key, options, provider, userPayload, pubSub);
    }
    
}