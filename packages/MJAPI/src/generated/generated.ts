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


import { ActivityEntity, Activity__DemoEntity, ActivitySentimentEntity, ActivityTagLinkEntity, ActivityTagEntity, ActivityTag__DemoEntity, ActivityTopicEntity, ActivityTypeEntity, ActivityType__DemoEntity, ContactInsightEntity, ContactTagLinkEntity, ContactTagEntity, ContactEntity, Contact__CRMEntity, Contact__DemoEntity, TopicEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType({ description: `Records interactions and activities with contacts (calls, emails, meetings, notes)` })
export class ContactsActivity_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the contact this activity is associated with`}) 
    @MaxLength(16)
    ContactID: string;
        
    @Field({description: `Type of activity (Phone Call, Email, Meeting, etc.)`}) 
    @MaxLength(16)
    ActivityTypeID: string;
        
    @Field({description: `MemberJunction user who performed or logged this activity`}) 
    @MaxLength(16)
    UserID: string;
        
    @Field({description: `Brief subject line or title for the activity`}) 
    @MaxLength(510)
    Subject: string;
        
    @Field({nullable: true, description: `Detailed description or notes about the activity`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Full raw content of the activity (email body, call transcript, etc.) used for AI analysis`}) 
    RawContent?: string;
        
    @Field({description: `Date and time when the activity occurred`}) 
    @MaxLength(10)
    ActivityDate: Date;
        
    @Field(() => Int, {nullable: true, description: `Duration of the activity in minutes (for calls, meetings)`}) 
    DurationMinutes?: number;
        
    @Field({description: `Current status of the activity (Planned, Completed, Cancelled)`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `AI-detected urgency level (Low, Medium, High, Critical)`}) 
    @MaxLength(40)
    UrgencyLevel?: string;
        
    @Field(() => Float, {nullable: true, description: `Numeric urgency score from AI analysis (0.0000 to 1.0000)`}) 
    UrgencyScore?: number;
        
    @Field(() => Boolean, {description: `Indicates if this activity requires a follow-up action`}) 
    RequiresFollowUp: boolean;
        
    @Field({nullable: true, description: `Suggested or scheduled date for follow-up`}) 
    @MaxLength(3)
    FollowUpDate?: Date;
        
    @Field(() => Boolean, {description: `Indicates if this activity has been processed by AI for sentiment/tagging`}) 
    ProcessedByAI: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    ActivityType: string;
        
    @Field() 
    @MaxLength(200)
    User: string;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreateContactsActivityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ActivityTypeID?: string;

    @Field({ nullable: true })
    UserID?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    RawContent: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    UrgencyLevel: string | null;

    @Field(() => Float, { nullable: true })
    UrgencyScore: number | null;

    @Field(() => Boolean, { nullable: true })
    RequiresFollowUp?: boolean;

    @Field({ nullable: true })
    FollowUpDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    ProcessedByAI?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class UpdateContactsActivityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ActivityTypeID?: string;

    @Field({ nullable: true })
    UserID?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    RawContent?: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    UrgencyLevel?: string | null;

    @Field(() => Float, { nullable: true })
    UrgencyScore?: number | null;

    @Field(() => Boolean, { nullable: true })
    RequiresFollowUp?: boolean;

    @Field({ nullable: true })
    FollowUpDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    ProcessedByAI?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RunContactsActivityViewResult {
    @Field(() => [ContactsActivity_])
    Results: ContactsActivity_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ContactsActivity_)
export class ContactsActivityResolver extends ResolverBase {
    @Query(() => RunContactsActivityViewResult)
    async RunContactsActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsActivityViewResult)
    async RunContactsActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsActivityViewResult)
    async RunContactsActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ContactsActivity_, { nullable: true })
    async ContactsActivity(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactsActivity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Contacts].[vwActivities] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => ContactsActivity_)
    async CreateContactsActivity(
        @Arg('input', () => CreateContactsActivityInput) input: CreateContactsActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ContactsActivity_)
    async UpdateContactsActivity(
        @Arg('input', () => UpdateContactsActivityInput) input: UpdateContactsActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ContactsActivity_)
    async DeleteContactsActivity(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities__Demo
//****************************************************************************
@ObjectType({ description: `Records interactions and activities with contacts (calls, emails, meetings, notes)` })
export class DemoActivity_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the contact this activity is associated with`}) 
    @MaxLength(16)
    ContactID: string;
        
    @Field({description: `Type of activity (Phone Call, Email, Meeting, etc.)`}) 
    @MaxLength(16)
    ActivityTypeID: string;
        
    @Field({description: `MemberJunction user who performed or logged this activity`}) 
    @MaxLength(16)
    UserID: string;
        
    @Field({description: `Brief subject line or title for the activity`}) 
    @MaxLength(510)
    Subject: string;
        
    @Field({nullable: true, description: `Detailed description or notes about the activity`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Full raw content of the activity (email body, call transcript, etc.) used for AI analysis`}) 
    RawContent?: string;
        
    @Field({description: `Date and time when the activity occurred`}) 
    @MaxLength(10)
    ActivityDate: Date;
        
    @Field(() => Int, {nullable: true, description: `Duration of the activity in minutes (for calls, meetings)`}) 
    DurationMinutes?: number;
        
    @Field({description: `Current status of the activity (Planned, Completed, Cancelled)`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `AI-detected urgency level (Low, Medium, High, Critical)`}) 
    @MaxLength(40)
    UrgencyLevel?: string;
        
    @Field(() => Float, {nullable: true, description: `Numeric urgency score from AI analysis (0.0000 to 1.0000)`}) 
    UrgencyScore?: number;
        
    @Field(() => Boolean, {description: `Indicates if this activity requires a follow-up action`}) 
    RequiresFollowUp: boolean;
        
    @Field({nullable: true, description: `Suggested or scheduled date for follow-up`}) 
    @MaxLength(3)
    FollowUpDate?: Date;
        
    @Field(() => Boolean, {description: `Indicates if this activity has been processed by AI for sentiment/tagging`}) 
    ProcessedByAI: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    ActivityType: string;
        
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [DemoActivityTagLink_])
    ActivityTagLinks_ActivityIDArray: DemoActivityTagLink_[]; // Link to ActivityTagLinks
    
    @Field(() => [DemoActivitySentiment_])
    ActivitySentiments_ActivityIDArray: DemoActivitySentiment_[]; // Link to ActivitySentiments
    
    @Field(() => [DemoActivityTopic_])
    ActivityTopics_ActivityIDArray: DemoActivityTopic_[]; // Link to ActivityTopics
    
}

//****************************************************************************
// INPUT TYPE for Activities__Demo
//****************************************************************************
@InputType()
export class CreateDemoActivityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ActivityTypeID?: string;

    @Field({ nullable: true })
    UserID?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    RawContent: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    UrgencyLevel: string | null;

    @Field(() => Float, { nullable: true })
    UrgencyScore: number | null;

    @Field(() => Boolean, { nullable: true })
    RequiresFollowUp?: boolean;

    @Field({ nullable: true })
    FollowUpDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    ProcessedByAI?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Activities__Demo
//****************************************************************************
@InputType()
export class UpdateDemoActivityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ActivityTypeID?: string;

    @Field({ nullable: true })
    UserID?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    RawContent?: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    UrgencyLevel?: string | null;

    @Field(() => Float, { nullable: true })
    UrgencyScore?: number | null;

    @Field(() => Boolean, { nullable: true })
    RequiresFollowUp?: boolean;

    @Field({ nullable: true })
    FollowUpDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    ProcessedByAI?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activities__Demo
//****************************************************************************
@ObjectType()
export class RunDemoActivityViewResult {
    @Field(() => [DemoActivity_])
    Results: DemoActivity_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoActivity_)
export class DemoActivityResolver extends ResolverBase {
    @Query(() => RunDemoActivityViewResult)
    async RunDemoActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityViewResult)
    async RunDemoActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityViewResult)
    async RunDemoActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities__Demo';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoActivity_, { nullable: true })
    async DemoActivity(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoActivity_ | null> {
        this.CheckUserReadPermissions('Activities__Demo', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivities__Demo] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities__Demo', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities__Demo', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DemoActivityTagLink_])
    async ActivityTagLinks_ActivityIDArray(@Root() demoactivity_: DemoActivity_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activity Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTagLinks] WHERE [ActivityID]='${demoactivity_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activity Tag Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DemoActivitySentiment_])
    async ActivitySentiments_ActivityIDArray(@Root() demoactivity_: DemoActivity_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activity Sentiments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivitySentiments] WHERE [ActivityID]='${demoactivity_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Sentiments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activity Sentiments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DemoActivityTopic_])
    async ActivityTopics_ActivityIDArray(@Root() demoactivity_: DemoActivity_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activity Topics', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTopics] WHERE [ActivityID]='${demoactivity_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Topics', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activity Topics', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DemoActivity_)
    async CreateDemoActivity(
        @Arg('input', () => CreateDemoActivityInput) input: CreateDemoActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities__Demo', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoActivity_)
    async UpdateDemoActivity(
        @Arg('input', () => UpdateDemoActivityInput) input: UpdateDemoActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities__Demo', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoActivity_)
    async DeleteDemoActivity(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activities__Demo', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Sentiments
//****************************************************************************
@ObjectType({ description: `Stores AI-generated sentiment analysis results for activities` })
export class DemoActivitySentiment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the activity that was analyzed`}) 
    @MaxLength(16)
    ActivityID: string;
        
    @Field({description: `Overall sentiment classification (Positive, Neutral, Negative)`}) 
    @MaxLength(40)
    OverallSentiment: string;
        
    @Field(() => Float, {description: `Numeric sentiment score from -1.0000 (negative) to 1.0000 (positive)`}) 
    SentimentScore: number;
        
    @Field({nullable: true, description: `Detected emotion category (Happy, Frustrated, Confused, Urgent, Grateful, etc.)`}) 
    @MaxLength(100)
    EmotionCategory?: string;
        
    @Field(() => Float, {description: `AI confidence in the analysis (0.0000 to 1.0000)`}) 
    ConfidenceScore: number;
        
    @Field({description: `Timestamp when the AI analysis was performed`}) 
    @MaxLength(10)
    AnalyzedAt: Date;
        
    @Field({nullable: true, description: `Name or identifier of the AI model used for analysis`}) 
    @MaxLength(510)
    AIModelUsed?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activity Sentiments
//****************************************************************************
@InputType()
export class CreateDemoActivitySentimentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    OverallSentiment?: string;

    @Field(() => Float, { nullable: true })
    SentimentScore?: number;

    @Field({ nullable: true })
    EmotionCategory: string | null;

    @Field(() => Float, { nullable: true })
    ConfidenceScore?: number;

    @Field({ nullable: true })
    AnalyzedAt?: Date;

    @Field({ nullable: true })
    AIModelUsed: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Activity Sentiments
//****************************************************************************
@InputType()
export class UpdateDemoActivitySentimentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    OverallSentiment?: string;

    @Field(() => Float, { nullable: true })
    SentimentScore?: number;

    @Field({ nullable: true })
    EmotionCategory?: string | null;

    @Field(() => Float, { nullable: true })
    ConfidenceScore?: number;

    @Field({ nullable: true })
    AnalyzedAt?: Date;

    @Field({ nullable: true })
    AIModelUsed?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Sentiments
//****************************************************************************
@ObjectType()
export class RunDemoActivitySentimentViewResult {
    @Field(() => [DemoActivitySentiment_])
    Results: DemoActivitySentiment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoActivitySentiment_)
export class DemoActivitySentimentResolver extends ResolverBase {
    @Query(() => RunDemoActivitySentimentViewResult)
    async RunDemoActivitySentimentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivitySentimentViewResult)
    async RunDemoActivitySentimentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivitySentimentViewResult)
    async RunDemoActivitySentimentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Sentiments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoActivitySentiment_, { nullable: true })
    async DemoActivitySentiment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoActivitySentiment_ | null> {
        this.CheckUserReadPermissions('Activity Sentiments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivitySentiments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Sentiments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Sentiments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DemoActivitySentiment_)
    async CreateDemoActivitySentiment(
        @Arg('input', () => CreateDemoActivitySentimentInput) input: CreateDemoActivitySentimentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Sentiments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoActivitySentiment_)
    async UpdateDemoActivitySentiment(
        @Arg('input', () => UpdateDemoActivitySentimentInput) input: UpdateDemoActivitySentimentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Sentiments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoActivitySentiment_)
    async DeleteDemoActivitySentiment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Sentiments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Tag Links
//****************************************************************************
@ObjectType({ description: `Join table linking activities to tags with AI confidence metadata` })
export class DemoActivityTagLink_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the activity being tagged`}) 
    @MaxLength(16)
    ActivityID: string;
        
    @Field({description: `Reference to the tag being applied`}) 
    @MaxLength(16)
    ActivityTagID: string;
        
    @Field(() => Float, {nullable: true, description: `AI confidence score for this tag assignment (0.0000 to 1.0000), NULL for manual tags`}) 
    ConfidenceScore?: number;
        
    @Field(() => Boolean, {description: `Indicates if this tag was applied by AI vs manually by a user`}) 
    AppliedByAI: boolean;
        
    @Field({description: `Timestamp when the tag was applied to the activity`}) 
    @MaxLength(10)
    AppliedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    ActivityTag: string;
        
}

//****************************************************************************
// INPUT TYPE for Activity Tag Links
//****************************************************************************
@InputType()
export class CreateDemoActivityTagLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    ActivityTagID?: string;

    @Field(() => Float, { nullable: true })
    ConfidenceScore: number | null;

    @Field(() => Boolean, { nullable: true })
    AppliedByAI?: boolean;

    @Field({ nullable: true })
    AppliedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Activity Tag Links
//****************************************************************************
@InputType()
export class UpdateDemoActivityTagLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    ActivityTagID?: string;

    @Field(() => Float, { nullable: true })
    ConfidenceScore?: number | null;

    @Field(() => Boolean, { nullable: true })
    AppliedByAI?: boolean;

    @Field({ nullable: true })
    AppliedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Tag Links
//****************************************************************************
@ObjectType()
export class RunDemoActivityTagLinkViewResult {
    @Field(() => [DemoActivityTagLink_])
    Results: DemoActivityTagLink_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoActivityTagLink_)
export class DemoActivityTagLinkResolver extends ResolverBase {
    @Query(() => RunDemoActivityTagLinkViewResult)
    async RunDemoActivityTagLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTagLinkViewResult)
    async RunDemoActivityTagLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTagLinkViewResult)
    async RunDemoActivityTagLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Tag Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoActivityTagLink_, { nullable: true })
    async DemoActivityTagLink(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoActivityTagLink_ | null> {
        this.CheckUserReadPermissions('Activity Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTagLinks] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Tag Links', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DemoActivityTagLink_)
    async CreateDemoActivityTagLink(
        @Arg('input', () => CreateDemoActivityTagLinkInput) input: CreateDemoActivityTagLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Tag Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoActivityTagLink_)
    async UpdateDemoActivityTagLink(
        @Arg('input', () => UpdateDemoActivityTagLinkInput) input: UpdateDemoActivityTagLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Tag Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoActivityTagLink_)
    async DeleteDemoActivityTagLink(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Tag Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Tags
//****************************************************************************
@ObjectType()
export class ContactsActivityTag_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Color?: string;
        
    @Field(() => Boolean) 
    IsAutoGenerated: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activity Tags
//****************************************************************************
@InputType()
export class CreateContactsActivityTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Color: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAutoGenerated?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Activity Tags
//****************************************************************************
@InputType()
export class UpdateContactsActivityTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Color?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAutoGenerated?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Tags
//****************************************************************************
@ObjectType()
export class RunContactsActivityTagViewResult {
    @Field(() => [ContactsActivityTag_])
    Results: ContactsActivityTag_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ContactsActivityTag_)
export class ContactsActivityTagResolver extends ResolverBase {
    @Query(() => RunContactsActivityTagViewResult)
    async RunContactsActivityTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsActivityTagViewResult)
    async RunContactsActivityTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsActivityTagViewResult)
    async RunContactsActivityTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ContactsActivityTag_, { nullable: true })
    async ContactsActivityTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactsActivityTag_ | null> {
        this.CheckUserReadPermissions('Activity Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Contacts].[vwActivityTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => ContactsActivityTag_)
    async CreateContactsActivityTag(
        @Arg('input', () => CreateContactsActivityTagInput) input: CreateContactsActivityTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ContactsActivityTag_)
    async UpdateContactsActivityTag(
        @Arg('input', () => UpdateContactsActivityTagInput) input: UpdateContactsActivityTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ContactsActivityTag_)
    async DeleteContactsActivityTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Tags__Demo
//****************************************************************************
@ObjectType({ description: `Tags specific to activities, including AI-generated tags (Complaint, Feature Request, Billing Issue, etc.)` })
export class DemoActivityTag_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the activity tag`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of what this tag represents`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true, description: `Hex color code or color name for UI display`}) 
    @MaxLength(100)
    Color?: string;
        
    @Field(() => Boolean, {description: `Indicates if this tag was created by AI vs manually by a user`}) 
    IsAutoGenerated: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [DemoActivityTagLink_])
    ActivityTagLinks_ActivityTagIDArray: DemoActivityTagLink_[]; // Link to ActivityTagLinks
    
}

//****************************************************************************
// INPUT TYPE for Activity Tags__Demo
//****************************************************************************
@InputType()
export class CreateDemoActivityTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Color: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAutoGenerated?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Activity Tags__Demo
//****************************************************************************
@InputType()
export class UpdateDemoActivityTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Color?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAutoGenerated?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Tags__Demo
//****************************************************************************
@ObjectType()
export class RunDemoActivityTagViewResult {
    @Field(() => [DemoActivityTag_])
    Results: DemoActivityTag_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoActivityTag_)
export class DemoActivityTagResolver extends ResolverBase {
    @Query(() => RunDemoActivityTagViewResult)
    async RunDemoActivityTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTagViewResult)
    async RunDemoActivityTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTagViewResult)
    async RunDemoActivityTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Tags__Demo';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoActivityTag_, { nullable: true })
    async DemoActivityTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoActivityTag_ | null> {
        this.CheckUserReadPermissions('Activity Tags__Demo', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTags__Demo] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Tags__Demo', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Tags__Demo', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DemoActivityTagLink_])
    async ActivityTagLinks_ActivityTagIDArray(@Root() demoactivitytag_: DemoActivityTag_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activity Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTagLinks] WHERE [ActivityTagID]='${demoactivitytag_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activity Tag Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DemoActivityTag_)
    async CreateDemoActivityTag(
        @Arg('input', () => CreateDemoActivityTagInput) input: CreateDemoActivityTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Tags__Demo', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoActivityTag_)
    async UpdateDemoActivityTag(
        @Arg('input', () => UpdateDemoActivityTagInput) input: UpdateDemoActivityTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Tags__Demo', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoActivityTag_)
    async DeleteDemoActivityTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Tags__Demo', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Topics
//****************************************************************************
@ObjectType({ description: `Links activities to detected topics with confidence and relevance ranking` })
export class DemoActivityTopic_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the activity`}) 
    @MaxLength(16)
    ActivityID: string;
        
    @Field({description: `Reference to the detected topic`}) 
    @MaxLength(16)
    TopicID: string;
        
    @Field(() => Float, {description: `AI confidence score for this topic detection (0.0000 to 1.0000)`}) 
    ConfidenceScore: number;
        
    @Field(() => Int, {description: `Relevance ranking (1 = primary topic, 2 = secondary, etc.)`}) 
    RelevanceRank: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Topic: string;
        
}

//****************************************************************************
// INPUT TYPE for Activity Topics
//****************************************************************************
@InputType()
export class CreateDemoActivityTopicInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    TopicID?: string;

    @Field(() => Float, { nullable: true })
    ConfidenceScore?: number;

    @Field(() => Int, { nullable: true })
    RelevanceRank?: number;
}
    

//****************************************************************************
// INPUT TYPE for Activity Topics
//****************************************************************************
@InputType()
export class UpdateDemoActivityTopicInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    TopicID?: string;

    @Field(() => Float, { nullable: true })
    ConfidenceScore?: number;

    @Field(() => Int, { nullable: true })
    RelevanceRank?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Topics
//****************************************************************************
@ObjectType()
export class RunDemoActivityTopicViewResult {
    @Field(() => [DemoActivityTopic_])
    Results: DemoActivityTopic_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoActivityTopic_)
export class DemoActivityTopicResolver extends ResolverBase {
    @Query(() => RunDemoActivityTopicViewResult)
    async RunDemoActivityTopicViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTopicViewResult)
    async RunDemoActivityTopicViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTopicViewResult)
    async RunDemoActivityTopicDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Topics';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoActivityTopic_, { nullable: true })
    async DemoActivityTopic(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoActivityTopic_ | null> {
        this.CheckUserReadPermissions('Activity Topics', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTopics] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Topics', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Topics', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DemoActivityTopic_)
    async CreateDemoActivityTopic(
        @Arg('input', () => CreateDemoActivityTopicInput) input: CreateDemoActivityTopicInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Topics', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoActivityTopic_)
    async UpdateDemoActivityTopic(
        @Arg('input', () => UpdateDemoActivityTopicInput) input: UpdateDemoActivityTopicInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Topics', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoActivityTopic_)
    async DeleteDemoActivityTopic(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Topics', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Types
//****************************************************************************
@ObjectType({ description: `Lookup table defining types of activities (Phone Call, Email, Meeting, etc.)` })
export class ContactsActivityType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the activity type`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of what this activity type represents`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome or similar icon class for UI display`}) 
    @MaxLength(200)
    Icon?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [ContactsActivity_])
    Activities_ActivityTypeIDArray: ContactsActivity_[]; // Link to Activities
    
}

//****************************************************************************
// INPUT TYPE for Activity Types
//****************************************************************************
@InputType()
export class CreateContactsActivityTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Icon: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Activity Types
//****************************************************************************
@InputType()
export class UpdateContactsActivityTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Icon?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Types
//****************************************************************************
@ObjectType()
export class RunContactsActivityTypeViewResult {
    @Field(() => [ContactsActivityType_])
    Results: ContactsActivityType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ContactsActivityType_)
export class ContactsActivityTypeResolver extends ResolverBase {
    @Query(() => RunContactsActivityTypeViewResult)
    async RunContactsActivityTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsActivityTypeViewResult)
    async RunContactsActivityTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsActivityTypeViewResult)
    async RunContactsActivityTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ContactsActivityType_, { nullable: true })
    async ContactsActivityType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactsActivityType_ | null> {
        this.CheckUserReadPermissions('Activity Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Contacts].[vwActivityTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Types', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [ContactsActivity_])
    async Activities_ActivityTypeIDArray(@Root() contactsactivitytype_: ContactsActivityType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Contacts].[vwActivities] WHERE [ActivityTypeID]='${contactsactivitytype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => ContactsActivityType_)
    async CreateContactsActivityType(
        @Arg('input', () => CreateContactsActivityTypeInput) input: CreateContactsActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ContactsActivityType_)
    async UpdateContactsActivityType(
        @Arg('input', () => UpdateContactsActivityTypeInput) input: UpdateContactsActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ContactsActivityType_)
    async DeleteContactsActivityType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activity Types__Demo
//****************************************************************************
@ObjectType({ description: `Lookup table defining types of activities (Phone Call, Email, Meeting, etc.)` })
export class DemoActivityType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the activity type`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of what this activity type represents`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome or similar icon class for UI display`}) 
    @MaxLength(200)
    Icon?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [DemoActivity_])
    Activities__Demo_ActivityTypeIDArray: DemoActivity_[]; // Link to Activities__Demo
    
}

//****************************************************************************
// INPUT TYPE for Activity Types__Demo
//****************************************************************************
@InputType()
export class CreateDemoActivityTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Icon: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Activity Types__Demo
//****************************************************************************
@InputType()
export class UpdateDemoActivityTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Icon?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activity Types__Demo
//****************************************************************************
@ObjectType()
export class RunDemoActivityTypeViewResult {
    @Field(() => [DemoActivityType_])
    Results: DemoActivityType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoActivityType_)
export class DemoActivityTypeResolver extends ResolverBase {
    @Query(() => RunDemoActivityTypeViewResult)
    async RunDemoActivityTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTypeViewResult)
    async RunDemoActivityTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoActivityTypeViewResult)
    async RunDemoActivityTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activity Types__Demo';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoActivityType_, { nullable: true })
    async DemoActivityType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoActivityType_ | null> {
        this.CheckUserReadPermissions('Activity Types__Demo', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTypes__Demo] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Types__Demo', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activity Types__Demo', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DemoActivity_])
    async Activities__Demo_ActivityTypeIDArray(@Root() demoactivitytype_: DemoActivityType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities__Demo', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivities__Demo] WHERE [ActivityTypeID]='${demoactivitytype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities__Demo', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities__Demo', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DemoActivityType_)
    async CreateDemoActivityType(
        @Arg('input', () => CreateDemoActivityTypeInput) input: CreateDemoActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activity Types__Demo', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoActivityType_)
    async UpdateDemoActivityType(
        @Arg('input', () => UpdateDemoActivityTypeInput) input: UpdateDemoActivityTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activity Types__Demo', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoActivityType_)
    async DeleteDemoActivityType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activity Types__Demo', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Insights
//****************************************************************************
@ObjectType({ description: `Aggregated AI-generated insights rolled up at the contact level` })
export class DemoContactInsight_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the contact these insights are about`}) 
    @MaxLength(16)
    ContactID: string;
        
    @Field({nullable: true, description: `Trend of sentiment over time (Improving, Stable, Declining)`}) 
    @MaxLength(40)
    OverallSentimentTrend?: string;
        
    @Field(() => Float, {nullable: true, description: `Average sentiment score across all activities (-1.0000 to 1.0000)`}) 
    AverageSentimentScore?: number;
        
    @Field({nullable: true, description: `JSON array of the most common topics for this contact`}) 
    TopTopics?: string;
        
    @Field({nullable: true, description: `Overall engagement level based on activity frequency (Low, Medium, High)`}) 
    @MaxLength(40)
    EngagementLevel?: string;
        
    @Field(() => Float, {nullable: true, description: `AI-predicted churn risk score (0.0000 to 1.0000)`}) 
    ChurnRiskScore?: number;
        
    @Field({description: `Timestamp when insights were last recalculated`}) 
    @MaxLength(10)
    LastAnalyzedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Insights
//****************************************************************************
@InputType()
export class CreateDemoContactInsightInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    OverallSentimentTrend: string | null;

    @Field(() => Float, { nullable: true })
    AverageSentimentScore: number | null;

    @Field({ nullable: true })
    TopTopics: string | null;

    @Field({ nullable: true })
    EngagementLevel: string | null;

    @Field(() => Float, { nullable: true })
    ChurnRiskScore: number | null;

    @Field({ nullable: true })
    LastAnalyzedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Contact Insights
//****************************************************************************
@InputType()
export class UpdateDemoContactInsightInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    OverallSentimentTrend?: string | null;

    @Field(() => Float, { nullable: true })
    AverageSentimentScore?: number | null;

    @Field({ nullable: true })
    TopTopics?: string | null;

    @Field({ nullable: true })
    EngagementLevel?: string | null;

    @Field(() => Float, { nullable: true })
    ChurnRiskScore?: number | null;

    @Field({ nullable: true })
    LastAnalyzedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Insights
//****************************************************************************
@ObjectType()
export class RunDemoContactInsightViewResult {
    @Field(() => [DemoContactInsight_])
    Results: DemoContactInsight_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoContactInsight_)
export class DemoContactInsightResolver extends ResolverBase {
    @Query(() => RunDemoContactInsightViewResult)
    async RunDemoContactInsightViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactInsightViewResult)
    async RunDemoContactInsightViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactInsightViewResult)
    async RunDemoContactInsightDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Insights';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoContactInsight_, { nullable: true })
    async DemoContactInsight(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoContactInsight_ | null> {
        this.CheckUserReadPermissions('Contact Insights', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContactInsights] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Insights', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Insights', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DemoContactInsight_)
    async CreateDemoContactInsight(
        @Arg('input', () => CreateDemoContactInsightInput) input: CreateDemoContactInsightInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Insights', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoContactInsight_)
    async UpdateDemoContactInsight(
        @Arg('input', () => UpdateDemoContactInsightInput) input: UpdateDemoContactInsightInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Insights', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoContactInsight_)
    async DeleteDemoContactInsight(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Insights', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Tag Links
//****************************************************************************
@ObjectType({ description: `Join table linking contacts to their tags (many-to-many relationship)` })
export class DemoContactTagLink_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Reference to the contact being tagged`}) 
    @MaxLength(16)
    ContactID: string;
        
    @Field({description: `Reference to the tag being applied`}) 
    @MaxLength(16)
    ContactTagID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    ContactTag: string;
        
}

//****************************************************************************
// INPUT TYPE for Contact Tag Links
//****************************************************************************
@InputType()
export class CreateDemoContactTagLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ContactTagID?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contact Tag Links
//****************************************************************************
@InputType()
export class UpdateDemoContactTagLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ContactTagID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Tag Links
//****************************************************************************
@ObjectType()
export class RunDemoContactTagLinkViewResult {
    @Field(() => [DemoContactTagLink_])
    Results: DemoContactTagLink_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoContactTagLink_)
export class DemoContactTagLinkResolver extends ResolverBase {
    @Query(() => RunDemoContactTagLinkViewResult)
    async RunDemoContactTagLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactTagLinkViewResult)
    async RunDemoContactTagLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactTagLinkViewResult)
    async RunDemoContactTagLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Tag Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoContactTagLink_, { nullable: true })
    async DemoContactTagLink(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoContactTagLink_ | null> {
        this.CheckUserReadPermissions('Contact Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContactTagLinks] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Tag Links', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DemoContactTagLink_)
    async CreateDemoContactTagLink(
        @Arg('input', () => CreateDemoContactTagLinkInput) input: CreateDemoContactTagLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Tag Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoContactTagLink_)
    async UpdateDemoContactTagLink(
        @Arg('input', () => UpdateDemoContactTagLinkInput) input: UpdateDemoContactTagLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Tag Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoContactTagLink_)
    async DeleteDemoContactTagLink(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Tag Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Tags
//****************************************************************************
@ObjectType({ description: `Tags for categorizing and grouping contacts (VIP, Lead, Customer, etc.)` })
export class DemoContactTag_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the tag`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Hex color code or color name for UI display`}) 
    @MaxLength(100)
    Color?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [DemoContactTagLink_])
    ContactTagLinks_ContactTagIDArray: DemoContactTagLink_[]; // Link to ContactTagLinks
    
}

//****************************************************************************
// INPUT TYPE for Contact Tags
//****************************************************************************
@InputType()
export class CreateDemoContactTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Color: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Contact Tags
//****************************************************************************
@InputType()
export class UpdateDemoContactTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Color?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Tags
//****************************************************************************
@ObjectType()
export class RunDemoContactTagViewResult {
    @Field(() => [DemoContactTag_])
    Results: DemoContactTag_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoContactTag_)
export class DemoContactTagResolver extends ResolverBase {
    @Query(() => RunDemoContactTagViewResult)
    async RunDemoContactTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactTagViewResult)
    async RunDemoContactTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactTagViewResult)
    async RunDemoContactTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoContactTag_, { nullable: true })
    async DemoContactTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoContactTag_ | null> {
        this.CheckUserReadPermissions('Contact Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContactTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DemoContactTagLink_])
    async ContactTagLinks_ContactTagIDArray(@Root() democontacttag_: DemoContactTag_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContactTagLinks] WHERE [ContactTagID]='${democontacttag_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tag Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DemoContactTag_)
    async CreateDemoContactTag(
        @Arg('input', () => CreateDemoContactTagInput) input: CreateDemoContactTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoContactTag_)
    async UpdateDemoContactTag(
        @Arg('input', () => UpdateDemoContactTagInput) input: UpdateDemoContactTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoContactTag_)
    async DeleteDemoContactTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `Stores contact information for people being tracked in the CRM system` })
export class ContactsContact_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `First name of the contact`}) 
    @MaxLength(200)
    FirstName: string;
        
    @Field({description: `Last name of the contact`}) 
    @MaxLength(200)
    LastName: string;
        
    @Field({nullable: true, description: `Primary email address for the contact`}) 
    @MaxLength(510)
    Email?: string;
        
    @Field({nullable: true, description: `Primary phone number for the contact`}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true, description: `Company or organization the contact is associated with`}) 
    @MaxLength(510)
    Company?: string;
        
    @Field({nullable: true, description: `Job title or role of the contact`}) 
    @MaxLength(300)
    Title?: string;
        
    @Field({description: `Current status of the contact (Active or Inactive)`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [ContactsActivity_])
    Activities_ContactIDArray: ContactsActivity_[]; // Link to Activities
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateContactsContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Company: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdateContactsContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Company?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunContactsContactViewResult {
    @Field(() => [ContactsContact_])
    Results: ContactsContact_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ContactsContact_)
export class ContactsContactResolver extends ResolverBase {
    @Query(() => RunContactsContactViewResult)
    async RunContactsContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsContactViewResult)
    async RunContactsContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactsContactViewResult)
    async RunContactsContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ContactsContact_, { nullable: true })
    async ContactsContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactsContact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Contacts].[vwContacts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [ContactsActivity_])
    async Activities_ContactIDArray(@Root() contactscontact_: ContactsContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Contacts].[vwActivities] WHERE [ContactID]='${contactscontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => ContactsContact_)
    async CreateContactsContact(
        @Arg('input', () => CreateContactsContactInput) input: CreateContactsContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ContactsContact_)
    async UpdateContactsContact(
        @Arg('input', () => UpdateContactsContactInput) input: UpdateContactsContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ContactsContact_)
    async DeleteContactsContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts__CRM
//****************************************************************************
@ObjectType()
export class CRMContact_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
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
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Company?: string;
        
    @Field({nullable: true}) 
    @MaxLength(300)
    Title?: string;
        
    @Field() 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contacts__CRM
//****************************************************************************
@InputType()
export class CreateCRMContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Company: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contacts__CRM
//****************************************************************************
@InputType()
export class UpdateCRMContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Company?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts__CRM
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
        input.EntityName = 'Contacts__CRM';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => CRMContact_, { nullable: true })
    async CRMContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CRMContact_ | null> {
        this.CheckUserReadPermissions('Contacts__CRM', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [CRM].[vwContacts__CRM] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts__CRM', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts__CRM', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => CRMContact_)
    async CreateCRMContact(
        @Arg('input', () => CreateCRMContactInput) input: CreateCRMContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts__CRM', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => CRMContact_)
    async UpdateCRMContact(
        @Arg('input', () => UpdateCRMContactInput) input: UpdateCRMContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts__CRM', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => CRMContact_)
    async DeleteCRMContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts__CRM', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts__Demo
//****************************************************************************
@ObjectType({ description: `Stores contact information for people being tracked in the CRM system` })
export class DemoContact_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `First name of the contact`}) 
    @MaxLength(200)
    FirstName: string;
        
    @Field({description: `Last name of the contact`}) 
    @MaxLength(200)
    LastName: string;
        
    @Field({nullable: true, description: `Primary email address for the contact`}) 
    @MaxLength(510)
    Email?: string;
        
    @Field({nullable: true, description: `Primary phone number for the contact`}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true, description: `Company or organization the contact is associated with`}) 
    @MaxLength(510)
    Company?: string;
        
    @Field({nullable: true, description: `Job title or role of the contact`}) 
    @MaxLength(300)
    Title?: string;
        
    @Field({description: `Current status of the contact (Active or Inactive)`}) 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [DemoContactInsight_])
    ContactInsights_ContactIDArray: DemoContactInsight_[]; // Link to ContactInsights
    
    @Field(() => [DemoContactTagLink_])
    ContactTagLinks_ContactIDArray: DemoContactTagLink_[]; // Link to ContactTagLinks
    
    @Field(() => [DemoActivity_])
    Activities__Demo_ContactIDArray: DemoActivity_[]; // Link to Activities__Demo
    
}

//****************************************************************************
// INPUT TYPE for Contacts__Demo
//****************************************************************************
@InputType()
export class CreateDemoContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Company: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contacts__Demo
//****************************************************************************
@InputType()
export class UpdateDemoContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Company?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts__Demo
//****************************************************************************
@ObjectType()
export class RunDemoContactViewResult {
    @Field(() => [DemoContact_])
    Results: DemoContact_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoContact_)
export class DemoContactResolver extends ResolverBase {
    @Query(() => RunDemoContactViewResult)
    async RunDemoContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactViewResult)
    async RunDemoContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoContactViewResult)
    async RunDemoContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts__Demo';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoContact_, { nullable: true })
    async DemoContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoContact_ | null> {
        this.CheckUserReadPermissions('Contacts__Demo', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContacts__Demo] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts__Demo', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts__Demo', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DemoContactInsight_])
    async ContactInsights_ContactIDArray(@Root() democontact_: DemoContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Insights', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContactInsights] WHERE [ContactID]='${democontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Insights', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Insights', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DemoContactTagLink_])
    async ContactTagLinks_ContactIDArray(@Root() democontact_: DemoContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwContactTagLinks] WHERE [ContactID]='${democontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tag Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DemoActivity_])
    async Activities__Demo_ContactIDArray(@Root() democontact_: DemoContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities__Demo', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivities__Demo] WHERE [ContactID]='${democontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities__Demo', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities__Demo', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DemoContact_)
    async CreateDemoContact(
        @Arg('input', () => CreateDemoContactInput) input: CreateDemoContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts__Demo', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoContact_)
    async UpdateDemoContact(
        @Arg('input', () => UpdateDemoContactInput) input: UpdateDemoContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts__Demo', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoContact_)
    async DeleteDemoContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts__Demo', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Topics
//****************************************************************************
@ObjectType({ description: `Hierarchical topic/theme categories detected in activities (Pricing, Support, Partnership, etc.)` })
export class DemoTopic_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the topic`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of what this topic covers`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field({nullable: true, description: `Reference to parent topic for hierarchical organization`}) 
    @MaxLength(16)
    ParentTopicID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ParentTopic?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentTopicID?: string;
        
    @Field(() => [DemoTopic_])
    Topics_ParentTopicIDArray: DemoTopic_[]; // Link to Topics
    
    @Field(() => [DemoActivityTopic_])
    ActivityTopics_TopicIDArray: DemoActivityTopic_[]; // Link to ActivityTopics
    
}

//****************************************************************************
// INPUT TYPE for Topics
//****************************************************************************
@InputType()
export class CreateDemoTopicInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentTopicID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Topics
//****************************************************************************
@InputType()
export class UpdateDemoTopicInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentTopicID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Topics
//****************************************************************************
@ObjectType()
export class RunDemoTopicViewResult {
    @Field(() => [DemoTopic_])
    Results: DemoTopic_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(DemoTopic_)
export class DemoTopicResolver extends ResolverBase {
    @Query(() => RunDemoTopicViewResult)
    async RunDemoTopicViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoTopicViewResult)
    async RunDemoTopicViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDemoTopicViewResult)
    async RunDemoTopicDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Topics';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DemoTopic_, { nullable: true })
    async DemoTopic(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoTopic_ | null> {
        this.CheckUserReadPermissions('Topics', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwTopics] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Topics', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Topics', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DemoTopic_])
    async Topics_ParentTopicIDArray(@Root() demotopic_: DemoTopic_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Topics', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwTopics] WHERE [ParentTopicID]='${demotopic_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Topics', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Topics', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DemoActivityTopic_])
    async ActivityTopics_TopicIDArray(@Root() demotopic_: DemoTopic_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activity Topics', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [Demo].[vwActivityTopics] WHERE [TopicID]='${demotopic_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activity Topics', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activity Topics', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DemoTopic_)
    async CreateDemoTopic(
        @Arg('input', () => CreateDemoTopicInput) input: CreateDemoTopicInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Topics', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DemoTopic_)
    async UpdateDemoTopic(
        @Arg('input', () => UpdateDemoTopicInput) input: UpdateDemoTopicInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Topics', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DemoTopic_)
    async DeleteDemoTopic(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Topics', key, options, provider, userPayload, pubSub);
    }
    
}