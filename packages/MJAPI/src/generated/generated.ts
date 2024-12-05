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
            AppContext, KeyValuePairInput, DeleteOptionsInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { ContributorContentEntity, ContentEntity, ContributorEntity, CsvProcessingLogEntity, Presenter_2024_EmailsEntity, Abstracts_Presenters_2024Entity, Abstracts_Presenters_2024_DecemberEntity, Abstracts_2024_DecemberEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Contributor Contents
//****************************************************************************
@ObjectType()
export class ContributorContent_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    SourceID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(15)
    Source?: string;
        
    @Field(() => Int) 
    ContributorID: number;
        
    @Field(() => Int, {nullable: true}) 
    ContentID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DOI?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Role1?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Role2?: string;
        
    @Field(() => Int, {nullable: true}) 
    CorrespondingAuthor?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Affiliation?: string;
        
    @Field(() => Int, {nullable: true}) 
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
    @Field(() => Int, { nullable: true })
    SourceID?: number;

    @Field({ nullable: true })
    Source?: string;

    @Field(() => Int)
    ContributorID: number;

    @Field(() => Int, { nullable: true })
    ContentID?: number;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Role1?: string;

    @Field({ nullable: true })
    Role2?: string;

    @Field(() => Int, { nullable: true })
    CorrespondingAuthor?: number;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field(() => Int, { nullable: true })
    Order?: number;
}
    

//****************************************************************************
// INPUT TYPE for Contributor Contents
//****************************************************************************
@InputType()
export class UpdateContributorContentInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    SourceID?: number;

    @Field({ nullable: true })
    Source?: string;

    @Field(() => Int)
    ContributorID: number;

    @Field(() => Int, { nullable: true })
    ContentID?: number;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Role1?: string;

    @Field({ nullable: true })
    Role2?: string;

    @Field(() => Int, { nullable: true })
    CorrespondingAuthor?: number;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field(() => Int, { nullable: true })
    Order?: number;

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
    async RunContributorContentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContributorContentViewResult)
    async RunContributorContentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContributorContentViewResult)
    async RunContributorContentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Contributor Contents';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ContributorContent_, { nullable: true })
    async ContributorContent(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContributorContent_ | null> {
        this.CheckUserReadPermissions('Contributor Contents', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwContributorContents] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Contributor Contents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Contributor Contents', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ContributorContent_)
    async CreateContributorContent(
        @Arg('input', () => CreateContributorContentInput) input: CreateContributorContentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Contributor Contents', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ContributorContent_)
    async UpdateContributorContent(
        @Arg('input', () => UpdateContributorContentInput) input: UpdateContributorContentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Contributor Contents', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ContributorContent_)
    async DeleteContributorContent(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contributor Contents', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contents
//****************************************************************************
@ObjectType()
export class Content_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    SourceID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Source?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ContentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ContentType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Title?: string;
        
    @Field({nullable: true}) 
    Text?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DOI?: string;
        
    @Field({nullable: true}) 
    URL?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    Date?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    EmbeddingID?: string;
        
    @Field(() => Boolean) 
    UpdateVector: boolean;
        
    @Field(() => Boolean) 
    isError: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contents
//****************************************************************************
@InputType()
export class CreateContentInput {
    @Field(() => Int, { nullable: true })
    SourceID?: number;

    @Field({ nullable: true })
    Source?: string;

    @Field({ nullable: true })
    ContentID?: string;

    @Field({ nullable: true })
    ContentType?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Text?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Date?: Date;

    @Field({ nullable: true })
    EmbeddingID?: string;

    @Field(() => Boolean)
    UpdateVector: boolean;

    @Field(() => Boolean)
    isError: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Contents
//****************************************************************************
@InputType()
export class UpdateContentInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    SourceID?: number;

    @Field({ nullable: true })
    Source?: string;

    @Field({ nullable: true })
    ContentID?: string;

    @Field({ nullable: true })
    ContentType?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Text?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Date?: Date;

    @Field({ nullable: true })
    EmbeddingID?: string;

    @Field(() => Boolean)
    UpdateVector: boolean;

    @Field(() => Boolean)
    isError: boolean;

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
    async RunContentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContentViewResult)
    async RunContentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContentViewResult)
    async RunContentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Contents';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Content_, { nullable: true })
    async Content(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Content_ | null> {
        this.CheckUserReadPermissions('Contents', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwContents] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Contents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Contents', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Content_)
    async CreateContent(
        @Arg('input', () => CreateContentInput) input: CreateContentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Contents', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Content_)
    async UpdateContent(
        @Arg('input', () => UpdateContentInput) input: UpdateContentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Contents', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Content_)
    async DeleteContent(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contents', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contributors
//****************************************************************************
@ObjectType()
export class Contributor_ {
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(200)
    CustomerID: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    JobTitle?: string;
        
    @Field(() => Boolean) 
    DoNotDisplay: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    EmbeddingID?: string;
        
    @Field(() => Boolean) 
    UpdateVector: boolean;
        
    @Field(() => Boolean) 
    isError: boolean;
        
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
    @Field()
    CustomerID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Organization?: string;

    @Field({ nullable: true })
    JobTitle?: string;

    @Field(() => Boolean)
    DoNotDisplay: boolean;

    @Field({ nullable: true })
    EmbeddingID?: string;

    @Field(() => Boolean)
    UpdateVector: boolean;

    @Field(() => Boolean)
    isError: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Contributors
//****************************************************************************
@InputType()
export class UpdateContributorInput {
    @Field(() => Int)
    ID: number;

    @Field()
    CustomerID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Organization?: string;

    @Field({ nullable: true })
    JobTitle?: string;

    @Field(() => Boolean)
    DoNotDisplay: boolean;

    @Field({ nullable: true })
    EmbeddingID?: string;

    @Field(() => Boolean)
    UpdateVector: boolean;

    @Field(() => Boolean)
    isError: boolean;

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
    async RunContributorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContributorViewResult)
    async RunContributorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContributorViewResult)
    async RunContributorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Contributors';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Contributor_, { nullable: true })
    async Contributor(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Contributor_ | null> {
        this.CheckUserReadPermissions('Contributors', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwContributors] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Contributors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Contributors', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Contributor_)
    async CreateContributor(
        @Arg('input', () => CreateContributorInput) input: CreateContributorInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Contributors', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Contributor_)
    async UpdateContributor(
        @Arg('input', () => UpdateContributorInput) input: UpdateContributorInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Contributors', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Contributor_)
    async DeleteContributor(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contributors', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Csv Processing Logs
//****************************************************************************
@ObjectType()
export class CsvProcessingLog_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    TotalRecords?: number;
        
    @Field(() => Int, {nullable: true}) 
    ProcessedRecords?: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    FileName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    CreatedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    UpdatedAt?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Csv Processing Logs
//****************************************************************************
@InputType()
export class CreateCsvProcessingLogInput {
    @Field(() => Int, { nullable: true })
    TotalRecords?: number;

    @Field(() => Int, { nullable: true })
    ProcessedRecords?: number;

    @Field({ nullable: true })
    FileName?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Csv Processing Logs
//****************************************************************************
@InputType()
export class UpdateCsvProcessingLogInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    TotalRecords?: number;

    @Field(() => Int, { nullable: true })
    ProcessedRecords?: number;

    @Field({ nullable: true })
    FileName?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Csv Processing Logs
//****************************************************************************
@ObjectType()
export class RunCsvProcessingLogViewResult {
    @Field(() => [CsvProcessingLog_])
    Results: CsvProcessingLog_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(CsvProcessingLog_)
export class CsvProcessingLogResolver extends ResolverBase {
    @Query(() => RunCsvProcessingLogViewResult)
    async RunCsvProcessingLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCsvProcessingLogViewResult)
    async RunCsvProcessingLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCsvProcessingLogViewResult)
    async RunCsvProcessingLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Csv Processing Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CsvProcessingLog_, { nullable: true })
    async CsvProcessingLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CsvProcessingLog_ | null> {
        this.CheckUserReadPermissions('Csv Processing Logs', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwCsvProcessingLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Csv Processing Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Csv Processing Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => CsvProcessingLog_)
    async CreateCsvProcessingLog(
        @Arg('input', () => CreateCsvProcessingLogInput) input: CreateCsvProcessingLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Csv Processing Logs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CsvProcessingLog_)
    async UpdateCsvProcessingLog(
        @Arg('input', () => UpdateCsvProcessingLogInput) input: UpdateCsvProcessingLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Csv Processing Logs', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => CsvProcessingLog_)
    async DeleteCsvProcessingLog(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Csv Processing Logs', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Presenter _2024_Emails
//****************************************************************************
@ObjectType()
export class Presenter_2024_Emails_ {
    @Field() 
    Customer_ID: string;
        
    @Field() 
    First_Name: string;
        
    @Field() 
    Last_Name: string;
        
    @Field() 
    Email: string;
        
    @Field() 
    Profile_Link: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Presenter _2024_Emails
//****************************************************************************
@InputType()
export class CreatePresenter_2024_EmailsInput {
    @Field()
    Customer_ID: string;

    @Field()
    First_Name: string;

    @Field()
    Last_Name: string;

    @Field()
    Email: string;

    @Field()
    Profile_Link: string;
}
    

//****************************************************************************
// INPUT TYPE for Presenter _2024_Emails
//****************************************************************************
@InputType()
export class UpdatePresenter_2024_EmailsInput {
    @Field()
    Customer_ID: string;

    @Field()
    First_Name: string;

    @Field()
    Last_Name: string;

    @Field()
    Email: string;

    @Field()
    Profile_Link: string;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Presenter _2024_Emails
//****************************************************************************
@ObjectType()
export class RunPresenter_2024_EmailsViewResult {
    @Field(() => [Presenter_2024_Emails_])
    Results: Presenter_2024_Emails_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Presenter_2024_Emails_)
export class Presenter_2024_EmailsResolver extends ResolverBase {
    @Query(() => RunPresenter_2024_EmailsViewResult)
    async RunPresenter_2024_EmailsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPresenter_2024_EmailsViewResult)
    async RunPresenter_2024_EmailsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPresenter_2024_EmailsViewResult)
    async RunPresenter_2024_EmailsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Presenter _2024_Emails';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Presenter_2024_Emails_, { nullable: true })
    async Presenter_2024_Emails(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Presenter_2024_Emails_ | null> {
        this.CheckUserReadPermissions('Presenter _2024_Emails', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwPresenter_2024_Emails] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Presenter _2024_Emails', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Presenter _2024_Emails', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Presenter_2024_Emails_)
    async CreatePresenter_2024_Emails(
        @Arg('input', () => CreatePresenter_2024_EmailsInput) input: CreatePresenter_2024_EmailsInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Presenter _2024_Emails', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Presenter_2024_Emails_)
    async UpdatePresenter_2024_Emails(
        @Arg('input', () => UpdatePresenter_2024_EmailsInput) input: UpdatePresenter_2024_EmailsInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Presenter _2024_Emails', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Presenter_2024_Emails_)
    async DeletePresenter_2024_Emails(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Presenter _2024_Emails', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Abstracts _Presenters _2024s
//****************************************************************************
@ObjectType()
export class Abstracts_Presenters_2024_ {
    @Field({nullable: true}) 
    Customer_ID?: string;
        
    @Field({nullable: true}) 
    DOI?: string;
        
    @Field({nullable: true}) 
    Role_1?: string;
        
    @Field({nullable: true}) 
    Role_2?: string;
        
    @Field({nullable: true}) 
    Affiliation?: string;
        
    @Field({nullable: true}) 
    Order?: string;
        
    @Field({nullable: true}) 
    column7?: string;
        
    @Field({nullable: true}) 
    rlt?: string;
        
    @Field({nullable: true}) 
    abs?: string;
        
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Abstracts _Presenters _2024s
//****************************************************************************
@InputType()
export class CreateAbstracts_Presenters_2024Input {
    @Field({ nullable: true })
    Customer_ID?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Role_1?: string;

    @Field({ nullable: true })
    Role_2?: string;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field({ nullable: true })
    Order?: string;

    @Field({ nullable: true })
    column7?: string;

    @Field({ nullable: true })
    rlt?: string;

    @Field({ nullable: true })
    abs?: string;
}
    

//****************************************************************************
// INPUT TYPE for Abstracts _Presenters _2024s
//****************************************************************************
@InputType()
export class UpdateAbstracts_Presenters_2024Input {
    @Field({ nullable: true })
    Customer_ID?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Role_1?: string;

    @Field({ nullable: true })
    Role_2?: string;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field({ nullable: true })
    Order?: string;

    @Field({ nullable: true })
    column7?: string;

    @Field({ nullable: true })
    rlt?: string;

    @Field({ nullable: true })
    abs?: string;

    @Field()
    ID: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Abstracts _Presenters _2024s
//****************************************************************************
@ObjectType()
export class RunAbstracts_Presenters_2024ViewResult {
    @Field(() => [Abstracts_Presenters_2024_])
    Results: Abstracts_Presenters_2024_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Abstracts_Presenters_2024_)
export class Abstracts_Presenters_2024Resolver extends ResolverBase {
    @Query(() => RunAbstracts_Presenters_2024ViewResult)
    async RunAbstracts_Presenters_2024ViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAbstracts_Presenters_2024ViewResult)
    async RunAbstracts_Presenters_2024ViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAbstracts_Presenters_2024ViewResult)
    async RunAbstracts_Presenters_2024DynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Abstracts _Presenters _2024s';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Abstracts_Presenters_2024_, { nullable: true })
    async Abstracts_Presenters_2024(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Abstracts_Presenters_2024_ | null> {
        this.CheckUserReadPermissions('Abstracts _Presenters _2024s', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwAbstracts_Presenters_2024s] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Abstracts _Presenters _2024s', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Abstracts _Presenters _2024s', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Abstracts_Presenters_2024_)
    async CreateAbstracts_Presenters_2024(
        @Arg('input', () => CreateAbstracts_Presenters_2024Input) input: CreateAbstracts_Presenters_2024Input,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Abstracts _Presenters _2024s', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Abstracts_Presenters_2024_)
    async UpdateAbstracts_Presenters_2024(
        @Arg('input', () => UpdateAbstracts_Presenters_2024Input) input: UpdateAbstracts_Presenters_2024Input,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Abstracts _Presenters _2024s', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Abstracts_Presenters_2024_)
    async DeleteAbstracts_Presenters_2024(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Abstracts _Presenters _2024s', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Abstracts _Presenters _2024_Decembers
//****************************************************************************
@ObjectType()
export class Abstracts_Presenters_2024_December_ {
    @Field({nullable: true}) 
    Customer_ID?: string;
        
    @Field({nullable: true}) 
    DOI?: string;
        
    @Field({nullable: true}) 
    Role_1?: string;
        
    @Field({nullable: true}) 
    Role_2?: string;
        
    @Field({nullable: true}) 
    Affiliation?: string;
        
    @Field({nullable: true}) 
    Order?: string;
        
    @Field({nullable: true}) 
    old_DOI?: string;
        
    @Field({nullable: true}) 
    column8?: string;
        
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Abstracts _Presenters _2024_Decembers
//****************************************************************************
@InputType()
export class CreateAbstracts_Presenters_2024_DecemberInput {
    @Field({ nullable: true })
    Customer_ID?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Role_1?: string;

    @Field({ nullable: true })
    Role_2?: string;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field({ nullable: true })
    Order?: string;

    @Field({ nullable: true })
    old_DOI?: string;

    @Field({ nullable: true })
    column8?: string;
}
    

//****************************************************************************
// INPUT TYPE for Abstracts _Presenters _2024_Decembers
//****************************************************************************
@InputType()
export class UpdateAbstracts_Presenters_2024_DecemberInput {
    @Field({ nullable: true })
    Customer_ID?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Role_1?: string;

    @Field({ nullable: true })
    Role_2?: string;

    @Field({ nullable: true })
    Affiliation?: string;

    @Field({ nullable: true })
    Order?: string;

    @Field({ nullable: true })
    old_DOI?: string;

    @Field({ nullable: true })
    column8?: string;

    @Field()
    ID: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Abstracts _Presenters _2024_Decembers
//****************************************************************************
@ObjectType()
export class RunAbstracts_Presenters_2024_DecemberViewResult {
    @Field(() => [Abstracts_Presenters_2024_December_])
    Results: Abstracts_Presenters_2024_December_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Abstracts_Presenters_2024_December_)
export class Abstracts_Presenters_2024_DecemberResolver extends ResolverBase {
    @Query(() => RunAbstracts_Presenters_2024_DecemberViewResult)
    async RunAbstracts_Presenters_2024_DecemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAbstracts_Presenters_2024_DecemberViewResult)
    async RunAbstracts_Presenters_2024_DecemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAbstracts_Presenters_2024_DecemberViewResult)
    async RunAbstracts_Presenters_2024_DecemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Abstracts _Presenters _2024_Decembers';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Abstracts_Presenters_2024_December_, { nullable: true })
    async Abstracts_Presenters_2024_December(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Abstracts_Presenters_2024_December_ | null> {
        this.CheckUserReadPermissions('Abstracts _Presenters _2024_Decembers', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwAbstracts_Presenters_2024_Decembers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Abstracts _Presenters _2024_Decembers', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Abstracts _Presenters _2024_Decembers', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Abstracts_Presenters_2024_December_)
    async CreateAbstracts_Presenters_2024_December(
        @Arg('input', () => CreateAbstracts_Presenters_2024_DecemberInput) input: CreateAbstracts_Presenters_2024_DecemberInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Abstracts _Presenters _2024_Decembers', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Abstracts_Presenters_2024_December_)
    async UpdateAbstracts_Presenters_2024_December(
        @Arg('input', () => UpdateAbstracts_Presenters_2024_DecemberInput) input: UpdateAbstracts_Presenters_2024_DecemberInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Abstracts _Presenters _2024_Decembers', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Abstracts_Presenters_2024_December_)
    async DeleteAbstracts_Presenters_2024_December(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Abstracts _Presenters _2024_Decembers', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Abstracts _2024_Decembers
//****************************************************************************
@ObjectType()
export class Abstracts_2024_December_ {
    @Field({nullable: true}) 
    Content_ID?: string;
        
    @Field({nullable: true}) 
    Content_Type?: string;
        
    @Field({nullable: true}) 
    Content_Title?: string;
        
    @Field({nullable: true}) 
    Abstract?: string;
        
    @Field({nullable: true}) 
    DOI?: string;
        
    @Field({nullable: true}) 
    Content_Date?: string;
        
    @Field({nullable: true}) 
    Category?: string;
        
    @Field({nullable: true}) 
    Meeting?: string;
        
    @Field({nullable: true}) 
    URL?: string;
        
    @Field({nullable: true}) 
    Old_DOI?: string;
        
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Abstracts _2024_Decembers
//****************************************************************************
@InputType()
export class CreateAbstracts_2024_DecemberInput {
    @Field({ nullable: true })
    Content_ID?: string;

    @Field({ nullable: true })
    Content_Type?: string;

    @Field({ nullable: true })
    Content_Title?: string;

    @Field({ nullable: true })
    Abstract?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Content_Date?: string;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Meeting?: string;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Old_DOI?: string;
}
    

//****************************************************************************
// INPUT TYPE for Abstracts _2024_Decembers
//****************************************************************************
@InputType()
export class UpdateAbstracts_2024_DecemberInput {
    @Field({ nullable: true })
    Content_ID?: string;

    @Field({ nullable: true })
    Content_Type?: string;

    @Field({ nullable: true })
    Content_Title?: string;

    @Field({ nullable: true })
    Abstract?: string;

    @Field({ nullable: true })
    DOI?: string;

    @Field({ nullable: true })
    Content_Date?: string;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Meeting?: string;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Old_DOI?: string;

    @Field()
    ID: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Abstracts _2024_Decembers
//****************************************************************************
@ObjectType()
export class RunAbstracts_2024_DecemberViewResult {
    @Field(() => [Abstracts_2024_December_])
    Results: Abstracts_2024_December_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Abstracts_2024_December_)
export class Abstracts_2024_DecemberResolver extends ResolverBase {
    @Query(() => RunAbstracts_2024_DecemberViewResult)
    async RunAbstracts_2024_DecemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAbstracts_2024_DecemberViewResult)
    async RunAbstracts_2024_DecemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAbstracts_2024_DecemberViewResult)
    async RunAbstracts_2024_DecemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Abstracts _2024_Decembers';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Abstracts_2024_December_, { nullable: true })
    async Abstracts_2024_December(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Abstracts_2024_December_ | null> {
        this.CheckUserReadPermissions('Abstracts _2024_Decembers', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwAbstracts_2024_Decembers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Abstracts _2024_Decembers', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Abstracts _2024_Decembers', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Abstracts_2024_December_)
    async CreateAbstracts_2024_December(
        @Arg('input', () => CreateAbstracts_2024_DecemberInput) input: CreateAbstracts_2024_DecemberInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Abstracts _2024_Decembers', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Abstracts_2024_December_)
    async UpdateAbstracts_2024_December(
        @Arg('input', () => UpdateAbstracts_2024_DecemberInput) input: UpdateAbstracts_2024_DecemberInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Abstracts _2024_Decembers', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Abstracts_2024_December_)
    async DeleteAbstracts_2024_December(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Abstracts _2024_Decembers', key, options, dataSource, userPayload, pubSub);
    }
    
}