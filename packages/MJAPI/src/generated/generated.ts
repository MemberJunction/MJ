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
            GetReadOnlyDataSource, GetReadWriteDataSource } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { EventEntity, ReplySeedEntity, PostSeedEntity, AuthorEntity, InstructorEntity, RegistrationEntity, ReplyEntity, Company__communityEntity, ForumEntity, OrganizationEntity, NameSeedEntity, Company__educationEntity, Company__membershipEntity, AttendeeEntity, StudentEntity, MemberEntity, OrganizationLinkEntity, PostEntity, Registration__educationEntity, JobTitleSeedEntity, PersonLinkEntity, MembershipRenewalEntity, MemberTypeEntity, CourseEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType({ description: `Listing of all past, present, and future events` })
export class Event_ {
    @Field(() => Int) 
    EventID: number;
        
    @Field() 
    @MaxLength(510)
    EventName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Location?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    StartDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    Zip?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    EventType?: string;
        
    @Field(() => Float, {nullable: true}) 
    MemberPrice?: number;
        
    @Field(() => Float, {nullable: true}) 
    NonMemberPrice?: number;
        
    @Field(() => Float, {nullable: true}) 
    SpeakerPrice?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Registration_])
    Registrations_EventIDArray: Registration_[]; // Link to Registrations
    
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreateEventInput {
    @Field({ nullable: true })
    EventName?: string;

    @Field({ nullable: true })
    Location: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Zip: string | null;

    @Field({ nullable: true })
    Country: string | null;

    @Field({ nullable: true })
    EventType: string | null;

    @Field(() => Float, { nullable: true })
    MemberPrice: number | null;

    @Field(() => Float, { nullable: true })
    NonMemberPrice: number | null;

    @Field(() => Float, { nullable: true })
    SpeakerPrice: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdateEventInput {
    @Field(() => Int)
    EventID: number;

    @Field({ nullable: true })
    EventName?: string;

    @Field({ nullable: true })
    Location?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Zip?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    EventType?: string | null;

    @Field(() => Float, { nullable: true })
    MemberPrice?: number | null;

    @Field(() => Float, { nullable: true })
    NonMemberPrice?: number | null;

    @Field(() => Float, { nullable: true })
    SpeakerPrice?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunEventViewResult {
    @Field(() => [Event_])
    Results: Event_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Event_)
export class EventResolver extends ResolverBase {
    @Query(() => RunEventViewResult)
    async RunEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEventViewResult)
    async RunEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEventViewResult)
    async RunEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Event_, { nullable: true })
    async Event(@Arg('EventID', () => Int) EventID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Event_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwEvents] WHERE [EventID]=${EventID} ` + this.getRowLevelSecurityWhereClause('Events', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Events', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Registration_])
    async Registrations_EventIDArray(@Root() event_: Event_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Registrations', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwRegistrations] WHERE [EventID]=${event_.EventID} ` + this.getRowLevelSecurityWhereClause('Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Registrations', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Event_)
    async CreateEvent(
        @Arg('input', () => CreateEventInput) input: CreateEventInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Events', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Event_)
    async UpdateEvent(
        @Arg('input', () => UpdateEventInput) input: UpdateEventInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Events', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Event_)
    async DeleteEvent(@Arg('EventID', () => Int) EventID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'EventID', Value: EventID}]);
        return this.DeleteRecord('Events', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Reply Seeds
//****************************************************************************
@ObjectType()
export class ReplySeed_ {
    @Field(() => Int) 
    ReplySeedID: number;
        
    @Field({nullable: true}) 
    Content?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Reply Seeds
//****************************************************************************
@InputType()
export class CreateReplySeedInput {
    @Field({ nullable: true })
    Content: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Reply Seeds
//****************************************************************************
@InputType()
export class UpdateReplySeedInput {
    @Field(() => Int)
    ReplySeedID: number;

    @Field({ nullable: true })
    Content?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Reply Seeds
//****************************************************************************
@ObjectType()
export class RunReplySeedViewResult {
    @Field(() => [ReplySeed_])
    Results: ReplySeed_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ReplySeed_)
export class ReplySeedResolver extends ResolverBase {
    @Query(() => RunReplySeedViewResult)
    async RunReplySeedViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReplySeedViewResult)
    async RunReplySeedViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReplySeedViewResult)
    async RunReplySeedDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Reply Seeds';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ReplySeed_, { nullable: true })
    async ReplySeed(@Arg('ReplySeedID', () => Int) ReplySeedID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ReplySeed_ | null> {
        this.CheckUserReadPermissions('Reply Seeds', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [reference].[vwReplySeeds] WHERE [ReplySeedID]=${ReplySeedID} ` + this.getRowLevelSecurityWhereClause('Reply Seeds', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Reply Seeds', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ReplySeed_)
    async CreateReplySeed(
        @Arg('input', () => CreateReplySeedInput) input: CreateReplySeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Reply Seeds', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ReplySeed_)
    async UpdateReplySeed(
        @Arg('input', () => UpdateReplySeedInput) input: UpdateReplySeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Reply Seeds', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ReplySeed_)
    async DeleteReplySeed(@Arg('ReplySeedID', () => Int) ReplySeedID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'ReplySeedID', Value: ReplySeedID}]);
        return this.DeleteRecord('Reply Seeds', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Post Seeds
//****************************************************************************
@ObjectType()
export class PostSeed_ {
    @Field(() => Int) 
    PostSeedID: number;
        
    @Field({nullable: true}) 
    Content?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Type?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Post Seeds
//****************************************************************************
@InputType()
export class CreatePostSeedInput {
    @Field({ nullable: true })
    Content: string | null;

    @Field({ nullable: true })
    Type: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Post Seeds
//****************************************************************************
@InputType()
export class UpdatePostSeedInput {
    @Field(() => Int)
    PostSeedID: number;

    @Field({ nullable: true })
    Content?: string | null;

    @Field({ nullable: true })
    Type?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Post Seeds
//****************************************************************************
@ObjectType()
export class RunPostSeedViewResult {
    @Field(() => [PostSeed_])
    Results: PostSeed_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(PostSeed_)
export class PostSeedResolver extends ResolverBase {
    @Query(() => RunPostSeedViewResult)
    async RunPostSeedViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPostSeedViewResult)
    async RunPostSeedViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPostSeedViewResult)
    async RunPostSeedDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Post Seeds';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => PostSeed_, { nullable: true })
    async PostSeed(@Arg('PostSeedID', () => Int) PostSeedID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<PostSeed_ | null> {
        this.CheckUserReadPermissions('Post Seeds', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [reference].[vwPostSeeds] WHERE [PostSeedID]=${PostSeedID} ` + this.getRowLevelSecurityWhereClause('Post Seeds', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Post Seeds', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => PostSeed_)
    async CreatePostSeed(
        @Arg('input', () => CreatePostSeedInput) input: CreatePostSeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Post Seeds', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => PostSeed_)
    async UpdatePostSeed(
        @Arg('input', () => UpdatePostSeedInput) input: UpdatePostSeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Post Seeds', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => PostSeed_)
    async DeletePostSeed(@Arg('PostSeedID', () => Int) PostSeedID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'PostSeedID', Value: PostSeedID}]);
        return this.DeleteRecord('Post Seeds', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Authors
//****************************************************************************
@ObjectType()
export class Author_ {
    @Field(() => Int) 
    AuthorID: number;
        
    @Field(() => Int, {nullable: true}) 
    CompanyID?: number;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    JobTitle?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Post_])
    Posts_AuthorIDArray: Post_[]; // Link to Posts
    
    @Field(() => [Reply_])
    Replies_AuthorIDArray: Reply_[]; // Link to Replies
    
    @Field(() => [PersonLink_])
    PersonLinks_CommunityAuthorIDArray: PersonLink_[]; // Link to PersonLinks
    
}

//****************************************************************************
// INPUT TYPE for Authors
//****************************************************************************
@InputType()
export class CreateAuthorInput {
    @Field(() => Int, { nullable: true })
    CompanyID: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    JobTitle: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Authors
//****************************************************************************
@InputType()
export class UpdateAuthorInput {
    @Field(() => Int)
    AuthorID: number;

    @Field(() => Int, { nullable: true })
    CompanyID?: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    JobTitle?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Authors
//****************************************************************************
@ObjectType()
export class RunAuthorViewResult {
    @Field(() => [Author_])
    Results: Author_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Author_)
export class AuthorResolver extends ResolverBase {
    @Query(() => RunAuthorViewResult)
    async RunAuthorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuthorViewResult)
    async RunAuthorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuthorViewResult)
    async RunAuthorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Authors';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Author_, { nullable: true })
    async Author(@Arg('AuthorID', () => Int) AuthorID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Author_ | null> {
        this.CheckUserReadPermissions('Authors', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwAuthors] WHERE [AuthorID]=${AuthorID} ` + this.getRowLevelSecurityWhereClause('Authors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Authors', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Post_])
    async Posts_AuthorIDArray(@Root() author_: Author_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Posts', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwPosts] WHERE [AuthorID]=${author_.AuthorID} ` + this.getRowLevelSecurityWhereClause('Posts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Posts', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [Reply_])
    async Replies_AuthorIDArray(@Root() author_: Author_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Replies', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwReplies] WHERE [AuthorID]=${author_.AuthorID} ` + this.getRowLevelSecurityWhereClause('Replies', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Replies', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [PersonLink_])
    async PersonLinks_CommunityAuthorIDArray(@Root() author_: Author_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersonLinks] WHERE [CommunityAuthorID]=${author_.AuthorID} ` + this.getRowLevelSecurityWhereClause('Person Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Person Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Author_)
    async CreateAuthor(
        @Arg('input', () => CreateAuthorInput) input: CreateAuthorInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Authors', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Author_)
    async UpdateAuthor(
        @Arg('input', () => UpdateAuthorInput) input: UpdateAuthorInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Authors', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Author_)
    async DeleteAuthor(@Arg('AuthorID', () => Int) AuthorID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'AuthorID', Value: AuthorID}]);
        return this.DeleteRecord('Authors', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Instructors
//****************************************************************************
@ObjectType()
export class Instructor_ {
    @Field(() => Int) 
    InstructorID: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Email?: string;
        
    @Field({nullable: true}) 
    Bio?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Course_])
    Courses_InstructorIDArray: Course_[]; // Link to Courses
    
}

//****************************************************************************
// INPUT TYPE for Instructors
//****************************************************************************
@InputType()
export class CreateInstructorInput {
    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Bio: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Instructors
//****************************************************************************
@InputType()
export class UpdateInstructorInput {
    @Field(() => Int)
    InstructorID: number;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Instructors
//****************************************************************************
@ObjectType()
export class RunInstructorViewResult {
    @Field(() => [Instructor_])
    Results: Instructor_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Instructor_)
export class InstructorResolver extends ResolverBase {
    @Query(() => RunInstructorViewResult)
    async RunInstructorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunInstructorViewResult)
    async RunInstructorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunInstructorViewResult)
    async RunInstructorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Instructors';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Instructor_, { nullable: true })
    async Instructor(@Arg('InstructorID', () => Int) InstructorID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Instructor_ | null> {
        this.CheckUserReadPermissions('Instructors', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwInstructors] WHERE [InstructorID]=${InstructorID} ` + this.getRowLevelSecurityWhereClause('Instructors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Instructors', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Course_])
    async Courses_InstructorIDArray(@Root() instructor_: Instructor_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Courses', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwCourses] WHERE [InstructorID]=${instructor_.InstructorID} ` + this.getRowLevelSecurityWhereClause('Courses', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Courses', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Instructor_)
    async CreateInstructor(
        @Arg('input', () => CreateInstructorInput) input: CreateInstructorInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Instructors', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Instructor_)
    async UpdateInstructor(
        @Arg('input', () => UpdateInstructorInput) input: UpdateInstructorInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Instructors', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Instructor_)
    async DeleteInstructor(@Arg('InstructorID', () => Int) InstructorID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'InstructorID', Value: InstructorID}]);
        return this.DeleteRecord('Instructors', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Registrations
//****************************************************************************
@ObjectType()
export class Registration_ {
    @Field(() => Int) 
    RegistrationID: number;
        
    @Field(() => Int) 
    EventID: number;
        
    @Field(() => Int) 
    AttendeeID: number;
        
    @Field() 
    @MaxLength(3)
    RegistrationDate: Date;
        
    @Field(() => Float, {nullable: true}) 
    RegistrationFee?: number;
        
    @Field({nullable: true, description: `Paid, Unpaid, Refunded`}) 
    @MaxLength(510)
    PaymentStatus?: string;
        
    @Field({nullable: true, description: `Registered, Pending, Canceled, Attended`}) 
    @MaxLength(510)
    Status?: string;
        
    @Field({nullable: true, description: `Attendee, Sponsor, Speaker`}) 
    @MaxLength(40)
    RegistrationType?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Registrations
//****************************************************************************
@InputType()
export class CreateRegistrationInput {
    @Field(() => Int, { nullable: true })
    EventID?: number;

    @Field(() => Int, { nullable: true })
    AttendeeID?: number;

    @Field({ nullable: true })
    RegistrationDate?: Date;

    @Field(() => Float, { nullable: true })
    RegistrationFee: number | null;

    @Field({ nullable: true })
    PaymentStatus: string | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    RegistrationType: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Registrations
//****************************************************************************
@InputType()
export class UpdateRegistrationInput {
    @Field(() => Int)
    RegistrationID: number;

    @Field(() => Int, { nullable: true })
    EventID?: number;

    @Field(() => Int, { nullable: true })
    AttendeeID?: number;

    @Field({ nullable: true })
    RegistrationDate?: Date;

    @Field(() => Float, { nullable: true })
    RegistrationFee?: number | null;

    @Field({ nullable: true })
    PaymentStatus?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    RegistrationType?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Registrations
//****************************************************************************
@ObjectType()
export class RunRegistrationViewResult {
    @Field(() => [Registration_])
    Results: Registration_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Registration_)
export class RegistrationResolver extends ResolverBase {
    @Query(() => RunRegistrationViewResult)
    async RunRegistrationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRegistrationViewResult)
    async RunRegistrationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRegistrationViewResult)
    async RunRegistrationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Registrations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Registration_, { nullable: true })
    async Registration(@Arg('RegistrationID', () => Int) RegistrationID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Registration_ | null> {
        this.CheckUserReadPermissions('Registrations', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwRegistrations] WHERE [RegistrationID]=${RegistrationID} ` + this.getRowLevelSecurityWhereClause('Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Registrations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Registration_)
    async CreateRegistration(
        @Arg('input', () => CreateRegistrationInput) input: CreateRegistrationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Registrations', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Registration_)
    async UpdateRegistration(
        @Arg('input', () => UpdateRegistrationInput) input: UpdateRegistrationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Registrations', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Registration_)
    async DeleteRegistration(@Arg('RegistrationID', () => Int) RegistrationID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'RegistrationID', Value: RegistrationID}]);
        return this.DeleteRecord('Registrations', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Replies
//****************************************************************************
@ObjectType()
export class Reply_ {
    @Field(() => Int) 
    ReplyID: number;
        
    @Field(() => Int) 
    PostID: number;
        
    @Field(() => Int) 
    AuthorID: number;
        
    @Field({nullable: true}) 
    ReplyContent?: string;
        
    @Field() 
    @MaxLength(3)
    ReplyDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Replies
//****************************************************************************
@InputType()
export class CreateReplyInput {
    @Field(() => Int, { nullable: true })
    PostID?: number;

    @Field(() => Int, { nullable: true })
    AuthorID?: number;

    @Field({ nullable: true })
    ReplyContent: string | null;

    @Field({ nullable: true })
    ReplyDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Replies
//****************************************************************************
@InputType()
export class UpdateReplyInput {
    @Field(() => Int)
    ReplyID: number;

    @Field(() => Int, { nullable: true })
    PostID?: number;

    @Field(() => Int, { nullable: true })
    AuthorID?: number;

    @Field({ nullable: true })
    ReplyContent?: string | null;

    @Field({ nullable: true })
    ReplyDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Replies
//****************************************************************************
@ObjectType()
export class RunReplyViewResult {
    @Field(() => [Reply_])
    Results: Reply_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Reply_)
export class ReplyResolver extends ResolverBase {
    @Query(() => RunReplyViewResult)
    async RunReplyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReplyViewResult)
    async RunReplyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReplyViewResult)
    async RunReplyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Replies';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Reply_, { nullable: true })
    async Reply(@Arg('ReplyID', () => Int) ReplyID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Reply_ | null> {
        this.CheckUserReadPermissions('Replies', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwReplies] WHERE [ReplyID]=${ReplyID} ` + this.getRowLevelSecurityWhereClause('Replies', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Replies', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Reply_)
    async CreateReply(
        @Arg('input', () => CreateReplyInput) input: CreateReplyInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Replies', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Reply_)
    async UpdateReply(
        @Arg('input', () => UpdateReplyInput) input: UpdateReplyInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Replies', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Reply_)
    async DeleteReply(@Arg('ReplyID', () => Int) ReplyID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'ReplyID', Value: ReplyID}]);
        return this.DeleteRecord('Replies', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Companies__community
//****************************************************************************
@ObjectType()
export class Company__community_ {
    @Field(() => Int) 
    CompanyID: number;
        
    @Field() 
    @MaxLength(510)
    CompanyName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Size?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Author_])
    Authors_CompanyIDArray: Author_[]; // Link to Authors
    
    @Field(() => [OrganizationLink_])
    OrganizationLinks_CommunityCompanyIDArray: OrganizationLink_[]; // Link to OrganizationLinks
    
}

//****************************************************************************
// INPUT TYPE for Companies__community
//****************************************************************************
@InputType()
export class CreateCompany__communityInput {
    @Field({ nullable: true })
    CompanyName?: string;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Industry: string | null;

    @Field({ nullable: true })
    Size: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Companies__community
//****************************************************************************
@InputType()
export class UpdateCompany__communityInput {
    @Field(() => Int)
    CompanyID: number;

    @Field({ nullable: true })
    CompanyName?: string;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field({ nullable: true })
    Size?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Companies__community
//****************************************************************************
@ObjectType()
export class RunCompany__communityViewResult {
    @Field(() => [Company__community_])
    Results: Company__community_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Company__community_)
export class Company__communityResolver extends ResolverBase {
    @Query(() => RunCompany__communityViewResult)
    async RunCompany__communityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompany__communityViewResult)
    async RunCompany__communityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompany__communityViewResult)
    async RunCompany__communityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Companies__community';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Company__community_, { nullable: true })
    async Company__community(@Arg('CompanyID', () => Int) CompanyID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Company__community_ | null> {
        this.CheckUserReadPermissions('Companies__community', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwCompanies__community] WHERE [CompanyID]=${CompanyID} ` + this.getRowLevelSecurityWhereClause('Companies__community', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Companies__community', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Author_])
    async Authors_CompanyIDArray(@Root() company__community_: Company__community_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Authors', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwAuthors] WHERE [CompanyID]=${company__community_.CompanyID} ` + this.getRowLevelSecurityWhereClause('Authors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Authors', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [OrganizationLink_])
    async OrganizationLinks_CommunityCompanyIDArray(@Root() company__community_: Company__community_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizationLinks] WHERE [CommunityCompanyID]=${company__community_.CompanyID} ` + this.getRowLevelSecurityWhereClause('Organization Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Organization Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Company__community_)
    async CreateCompany__community(
        @Arg('input', () => CreateCompany__communityInput) input: CreateCompany__communityInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Companies__community', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Company__community_)
    async UpdateCompany__community(
        @Arg('input', () => UpdateCompany__communityInput) input: UpdateCompany__communityInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Companies__community', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Company__community_)
    async DeleteCompany__community(@Arg('CompanyID', () => Int) CompanyID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'CompanyID', Value: CompanyID}]);
        return this.DeleteRecord('Companies__community', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Forums
//****************************************************************************
@ObjectType()
export class Forum_ {
    @Field(() => Int) 
    ForumID: number;
        
    @Field() 
    @MaxLength(510)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(3)
    CreationDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Post_])
    Posts_ForumIDArray: Post_[]; // Link to Posts
    
}

//****************************************************************************
// INPUT TYPE for Forums
//****************************************************************************
@InputType()
export class CreateForumInput {
    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CreationDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Forums
//****************************************************************************
@InputType()
export class UpdateForumInput {
    @Field(() => Int)
    ForumID: number;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CreationDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Forums
//****************************************************************************
@ObjectType()
export class RunForumViewResult {
    @Field(() => [Forum_])
    Results: Forum_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Forum_)
export class ForumResolver extends ResolverBase {
    @Query(() => RunForumViewResult)
    async RunForumViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunForumViewResult)
    async RunForumViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunForumViewResult)
    async RunForumDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Forums';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Forum_, { nullable: true })
    async Forum(@Arg('ForumID', () => Int) ForumID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Forum_ | null> {
        this.CheckUserReadPermissions('Forums', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwForums] WHERE [ForumID]=${ForumID} ` + this.getRowLevelSecurityWhereClause('Forums', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Forums', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Post_])
    async Posts_ForumIDArray(@Root() forum_: Forum_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Posts', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwPosts] WHERE [ForumID]=${forum_.ForumID} ` + this.getRowLevelSecurityWhereClause('Posts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Posts', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Forum_)
    async CreateForum(
        @Arg('input', () => CreateForumInput) input: CreateForumInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Forums', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Forum_)
    async UpdateForum(
        @Arg('input', () => UpdateForumInput) input: UpdateForumInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Forums', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Forum_)
    async DeleteForum(@Arg('ForumID', () => Int) ForumID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'ForumID', Value: ForumID}]);
        return this.DeleteRecord('Forums', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organizations
//****************************************************************************
@ObjectType()
export class Organization_ {
    @Field(() => Int) 
    OrganizationID: number;
        
    @Field() 
    @MaxLength(510)
    OrganizationName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Size?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Attendee_])
    Attendees_OrganizationIDArray: Attendee_[]; // Link to Attendees
    
    @Field(() => [OrganizationLink_])
    OrganizationLinks_EventsOrganizationIDArray: OrganizationLink_[]; // Link to OrganizationLinks
    
}

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class CreateOrganizationInput {
    @Field({ nullable: true })
    OrganizationName?: string;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Industry: string | null;

    @Field({ nullable: true })
    Size: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class UpdateOrganizationInput {
    @Field(() => Int)
    OrganizationID: number;

    @Field({ nullable: true })
    OrganizationName?: string;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field({ nullable: true })
    Size?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organizations
//****************************************************************************
@ObjectType()
export class RunOrganizationViewResult {
    @Field(() => [Organization_])
    Results: Organization_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Organization_)
export class OrganizationResolver extends ResolverBase {
    @Query(() => RunOrganizationViewResult)
    async RunOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOrganizationViewResult)
    async RunOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOrganizationViewResult)
    async RunOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organizations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Organization_, { nullable: true })
    async Organization(@Arg('OrganizationID', () => Int) OrganizationID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Organization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwOrganizations] WHERE [OrganizationID]=${OrganizationID} ` + this.getRowLevelSecurityWhereClause('Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Organizations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Attendee_])
    async Attendees_OrganizationIDArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Attendees', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwAttendees] WHERE [OrganizationID]=${organization_.OrganizationID} ` + this.getRowLevelSecurityWhereClause('Attendees', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Attendees', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [OrganizationLink_])
    async OrganizationLinks_EventsOrganizationIDArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizationLinks] WHERE [EventsOrganizationID]=${organization_.OrganizationID} ` + this.getRowLevelSecurityWhereClause('Organization Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Organization Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Organization_)
    async CreateOrganization(
        @Arg('input', () => CreateOrganizationInput) input: CreateOrganizationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Organizations', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Organization_)
    async UpdateOrganization(
        @Arg('input', () => UpdateOrganizationInput) input: UpdateOrganizationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Organizations', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Organization_)
    async DeleteOrganization(@Arg('OrganizationID', () => Int) OrganizationID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'OrganizationID', Value: OrganizationID}]);
        return this.DeleteRecord('Organizations', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Name Seeds
//****************************************************************************
@ObjectType()
export class NameSeed_ {
    @Field(() => Int) 
    NameID: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    NameType?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Name Seeds
//****************************************************************************
@InputType()
export class CreateNameSeedInput {
    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    NameType: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Name Seeds
//****************************************************************************
@InputType()
export class UpdateNameSeedInput {
    @Field(() => Int)
    NameID: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    NameType?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Name Seeds
//****************************************************************************
@ObjectType()
export class RunNameSeedViewResult {
    @Field(() => [NameSeed_])
    Results: NameSeed_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NameSeed_)
export class NameSeedResolver extends ResolverBase {
    @Query(() => RunNameSeedViewResult)
    async RunNameSeedViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunNameSeedViewResult)
    async RunNameSeedViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunNameSeedViewResult)
    async RunNameSeedDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Name Seeds';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => NameSeed_, { nullable: true })
    async NameSeed(@Arg('NameID', () => Int) NameID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NameSeed_ | null> {
        this.CheckUserReadPermissions('Name Seeds', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [reference].[vwNameSeeds] WHERE [NameID]=${NameID} ` + this.getRowLevelSecurityWhereClause('Name Seeds', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Name Seeds', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => NameSeed_)
    async CreateNameSeed(
        @Arg('input', () => CreateNameSeedInput) input: CreateNameSeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Name Seeds', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => NameSeed_)
    async UpdateNameSeed(
        @Arg('input', () => UpdateNameSeedInput) input: UpdateNameSeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Name Seeds', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => NameSeed_)
    async DeleteNameSeed(@Arg('NameID', () => Int) NameID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'NameID', Value: NameID}]);
        return this.DeleteRecord('Name Seeds', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Companies__education
//****************************************************************************
@ObjectType()
export class Company__education_ {
    @Field(() => Int) 
    CompanyID: number;
        
    @Field() 
    @MaxLength(510)
    CompanyName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Size?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Student_])
    Students_CompanyIDArray: Student_[]; // Link to Students
    
    @Field(() => [OrganizationLink_])
    OrganizationLinks_EducationCompanyIDArray: OrganizationLink_[]; // Link to OrganizationLinks
    
}

//****************************************************************************
// INPUT TYPE for Companies__education
//****************************************************************************
@InputType()
export class CreateCompany__educationInput {
    @Field({ nullable: true })
    CompanyName?: string;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Industry: string | null;

    @Field({ nullable: true })
    Size: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Companies__education
//****************************************************************************
@InputType()
export class UpdateCompany__educationInput {
    @Field(() => Int)
    CompanyID: number;

    @Field({ nullable: true })
    CompanyName?: string;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field({ nullable: true })
    Size?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Companies__education
//****************************************************************************
@ObjectType()
export class RunCompany__educationViewResult {
    @Field(() => [Company__education_])
    Results: Company__education_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Company__education_)
export class Company__educationResolver extends ResolverBase {
    @Query(() => RunCompany__educationViewResult)
    async RunCompany__educationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompany__educationViewResult)
    async RunCompany__educationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompany__educationViewResult)
    async RunCompany__educationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Companies__education';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Company__education_, { nullable: true })
    async Company__education(@Arg('CompanyID', () => Int) CompanyID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Company__education_ | null> {
        this.CheckUserReadPermissions('Companies__education', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwCompanies__education] WHERE [CompanyID]=${CompanyID} ` + this.getRowLevelSecurityWhereClause('Companies__education', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Companies__education', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Student_])
    async Students_CompanyIDArray(@Root() company__education_: Company__education_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Students', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwStudents] WHERE [CompanyID]=${company__education_.CompanyID} ` + this.getRowLevelSecurityWhereClause('Students', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Students', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [OrganizationLink_])
    async OrganizationLinks_EducationCompanyIDArray(@Root() company__education_: Company__education_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizationLinks] WHERE [EducationCompanyID]=${company__education_.CompanyID} ` + this.getRowLevelSecurityWhereClause('Organization Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Organization Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Company__education_)
    async CreateCompany__education(
        @Arg('input', () => CreateCompany__educationInput) input: CreateCompany__educationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Companies__education', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Company__education_)
    async UpdateCompany__education(
        @Arg('input', () => UpdateCompany__educationInput) input: UpdateCompany__educationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Companies__education', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Company__education_)
    async DeleteCompany__education(@Arg('CompanyID', () => Int) CompanyID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'CompanyID', Value: CompanyID}]);
        return this.DeleteRecord('Companies__education', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Companies__membership
//****************************************************************************
@ObjectType()
export class Company__membership_ {
    @Field(() => Int) 
    CompanyID: number;
        
    @Field() 
    @MaxLength(510)
    CompanyName: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Website?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Size?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    TaxID?: string;
        
    @Field(() => Int, {nullable: true}) 
    Subsection?: number;
        
    @Field(() => Float, {nullable: true}) 
    TotalRevenue?: number;
        
    @Field(() => Float, {nullable: true}) 
    InformationTechnologyExpense?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Member_])
    Members_CompanyIDArray: Member_[]; // Link to Members
    
    @Field(() => [OrganizationLink_])
    OrganizationLinks_MembershipCompanyIDArray: OrganizationLink_[]; // Link to OrganizationLinks
    
}

//****************************************************************************
// INPUT TYPE for Companies__membership
//****************************************************************************
@InputType()
export class CreateCompany__membershipInput {
    @Field({ nullable: true })
    CompanyName?: string;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Industry: string | null;

    @Field({ nullable: true })
    Size: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;

    @Field({ nullable: true })
    TaxID: string | null;

    @Field(() => Int, { nullable: true })
    Subsection: number | null;

    @Field(() => Float, { nullable: true })
    TotalRevenue: number | null;

    @Field(() => Float, { nullable: true })
    InformationTechnologyExpense: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Companies__membership
//****************************************************************************
@InputType()
export class UpdateCompany__membershipInput {
    @Field(() => Int)
    CompanyID: number;

    @Field({ nullable: true })
    CompanyName?: string;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field({ nullable: true })
    Size?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    TaxID?: string | null;

    @Field(() => Int, { nullable: true })
    Subsection?: number | null;

    @Field(() => Float, { nullable: true })
    TotalRevenue?: number | null;

    @Field(() => Float, { nullable: true })
    InformationTechnologyExpense?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Companies__membership
//****************************************************************************
@ObjectType()
export class RunCompany__membershipViewResult {
    @Field(() => [Company__membership_])
    Results: Company__membership_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Company__membership_)
export class Company__membershipResolver extends ResolverBase {
    @Query(() => RunCompany__membershipViewResult)
    async RunCompany__membershipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompany__membershipViewResult)
    async RunCompany__membershipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompany__membershipViewResult)
    async RunCompany__membershipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Companies__membership';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Company__membership_, { nullable: true })
    async Company__membership(@Arg('CompanyID', () => Int) CompanyID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Company__membership_ | null> {
        this.CheckUserReadPermissions('Companies__membership', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwCompanies__membership] WHERE [CompanyID]=${CompanyID} ` + this.getRowLevelSecurityWhereClause('Companies__membership', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Companies__membership', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Member_])
    async Members_CompanyIDArray(@Root() company__membership_: Company__membership_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwMembers] WHERE [CompanyID]=${company__membership_.CompanyID} ` + this.getRowLevelSecurityWhereClause('Members', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Members', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [OrganizationLink_])
    async OrganizationLinks_MembershipCompanyIDArray(@Root() company__membership_: Company__membership_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organization Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizationLinks] WHERE [MembershipCompanyID]=${company__membership_.CompanyID} ` + this.getRowLevelSecurityWhereClause('Organization Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Organization Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Company__membership_)
    async CreateCompany__membership(
        @Arg('input', () => CreateCompany__membershipInput) input: CreateCompany__membershipInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Companies__membership', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Company__membership_)
    async UpdateCompany__membership(
        @Arg('input', () => UpdateCompany__membershipInput) input: UpdateCompany__membershipInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Companies__membership', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Company__membership_)
    async DeleteCompany__membership(@Arg('CompanyID', () => Int) CompanyID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'CompanyID', Value: CompanyID}]);
        return this.DeleteRecord('Companies__membership', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Attendees
//****************************************************************************
@ObjectType()
export class Attendee_ {
    @Field(() => Int) 
    AttendeeID: number;
        
    @Field(() => Int, {nullable: true}) 
    OrganizationID?: number;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    JobTitle?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [PersonLink_])
    PersonLinks_EventsAttendeeIDArray: PersonLink_[]; // Link to PersonLinks
    
    @Field(() => [Registration_])
    Registrations_AttendeeIDArray: Registration_[]; // Link to Registrations
    
}

//****************************************************************************
// INPUT TYPE for Attendees
//****************************************************************************
@InputType()
export class CreateAttendeeInput {
    @Field(() => Int, { nullable: true })
    OrganizationID: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    JobTitle: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Attendees
//****************************************************************************
@InputType()
export class UpdateAttendeeInput {
    @Field(() => Int)
    AttendeeID: number;

    @Field(() => Int, { nullable: true })
    OrganizationID?: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    JobTitle?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Attendees
//****************************************************************************
@ObjectType()
export class RunAttendeeViewResult {
    @Field(() => [Attendee_])
    Results: Attendee_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Attendee_)
export class AttendeeResolver extends ResolverBase {
    @Query(() => RunAttendeeViewResult)
    async RunAttendeeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAttendeeViewResult)
    async RunAttendeeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAttendeeViewResult)
    async RunAttendeeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Attendees';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Attendee_, { nullable: true })
    async Attendee(@Arg('AttendeeID', () => Int) AttendeeID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Attendee_ | null> {
        this.CheckUserReadPermissions('Attendees', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwAttendees] WHERE [AttendeeID]=${AttendeeID} ` + this.getRowLevelSecurityWhereClause('Attendees', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Attendees', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [PersonLink_])
    async PersonLinks_EventsAttendeeIDArray(@Root() attendee_: Attendee_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersonLinks] WHERE [EventsAttendeeID]=${attendee_.AttendeeID} ` + this.getRowLevelSecurityWhereClause('Person Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Person Links', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [Registration_])
    async Registrations_AttendeeIDArray(@Root() attendee_: Attendee_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Registrations', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [events].[vwRegistrations] WHERE [AttendeeID]=${attendee_.AttendeeID} ` + this.getRowLevelSecurityWhereClause('Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Registrations', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Attendee_)
    async CreateAttendee(
        @Arg('input', () => CreateAttendeeInput) input: CreateAttendeeInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Attendees', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Attendee_)
    async UpdateAttendee(
        @Arg('input', () => UpdateAttendeeInput) input: UpdateAttendeeInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Attendees', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Attendee_)
    async DeleteAttendee(@Arg('AttendeeID', () => Int) AttendeeID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'AttendeeID', Value: AttendeeID}]);
        return this.DeleteRecord('Attendees', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Students
//****************************************************************************
@ObjectType()
export class Student_ {
    @Field(() => Int) 
    StudentID: number;
        
    @Field(() => Int, {nullable: true}) 
    CompanyID?: number;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    JobTitle?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ZipCode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Registration__education_])
    Registrations__education_StudentIDArray: Registration__education_[]; // Link to Registrations__education
    
    @Field(() => [PersonLink_])
    PersonLinks_EducationStudentIDArray: PersonLink_[]; // Link to PersonLinks
    
}

//****************************************************************************
// INPUT TYPE for Students
//****************************************************************************
@InputType()
export class CreateStudentInput {
    @Field(() => Int, { nullable: true })
    CompanyID: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    JobTitle: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    Country: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Students
//****************************************************************************
@InputType()
export class UpdateStudentInput {
    @Field(() => Int)
    StudentID: number;

    @Field(() => Int, { nullable: true })
    CompanyID?: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    JobTitle?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Students
//****************************************************************************
@ObjectType()
export class RunStudentViewResult {
    @Field(() => [Student_])
    Results: Student_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Student_)
export class StudentResolver extends ResolverBase {
    @Query(() => RunStudentViewResult)
    async RunStudentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunStudentViewResult)
    async RunStudentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunStudentViewResult)
    async RunStudentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Students';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Student_, { nullable: true })
    async Student(@Arg('StudentID', () => Int) StudentID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Student_ | null> {
        this.CheckUserReadPermissions('Students', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwStudents] WHERE [StudentID]=${StudentID} ` + this.getRowLevelSecurityWhereClause('Students', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Students', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Registration__education_])
    async Registrations__education_StudentIDArray(@Root() student_: Student_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Registrations__education', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwRegistrations__education] WHERE [StudentID]=${student_.StudentID} ` + this.getRowLevelSecurityWhereClause('Registrations__education', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Registrations__education', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [PersonLink_])
    async PersonLinks_EducationStudentIDArray(@Root() student_: Student_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersonLinks] WHERE [EducationStudentID]=${student_.StudentID} ` + this.getRowLevelSecurityWhereClause('Person Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Person Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Student_)
    async CreateStudent(
        @Arg('input', () => CreateStudentInput) input: CreateStudentInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Students', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Student_)
    async UpdateStudent(
        @Arg('input', () => UpdateStudentInput) input: UpdateStudentInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Students', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Student_)
    async DeleteStudent(@Arg('StudentID', () => Int) StudentID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'StudentID', Value: StudentID}]);
        return this.DeleteRecord('Students', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Members
//****************************************************************************
@ObjectType()
export class Member_ {
    @Field(() => Int) 
    MemberID: number;
        
    @Field(() => Int, {nullable: true}) 
    CompanyID?: number;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    JobTitle?: string;
        
    @Field() 
    @MaxLength(3)
    JoinDate: Date;
        
    @Field(() => Int) 
    MemberTypeID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [MembershipRenewal_])
    MembershipRenewals_MemberIDArray: MembershipRenewal_[]; // Link to MembershipRenewals
    
    @Field(() => [PersonLink_])
    PersonLinks_MembershipMemberIDArray: PersonLink_[]; // Link to PersonLinks
    
}

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class CreateMemberInput {
    @Field(() => Int, { nullable: true })
    CompanyID: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    JobTitle: string | null;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field(() => Int, { nullable: true })
    MemberTypeID?: number;
}
    

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class UpdateMemberInput {
    @Field(() => Int)
    MemberID: number;

    @Field(() => Int, { nullable: true })
    CompanyID?: number | null;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    JobTitle?: string | null;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field(() => Int, { nullable: true })
    MemberTypeID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Members
//****************************************************************************
@ObjectType()
export class RunMemberViewResult {
    @Field(() => [Member_])
    Results: Member_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Member_)
export class MemberResolver extends ResolverBase {
    @Query(() => RunMemberViewResult)
    async RunMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMemberViewResult)
    async RunMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMemberViewResult)
    async RunMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Members';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Member_, { nullable: true })
    async Member(@Arg('MemberID', () => Int) MemberID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Member_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwMembers] WHERE [MemberID]=${MemberID} ` + this.getRowLevelSecurityWhereClause('Members', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Members', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [MembershipRenewal_])
    async MembershipRenewals_MemberIDArray(@Root() member_: Member_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Membership Renewals', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwMembershipRenewals] WHERE [MemberID]=${member_.MemberID} ` + this.getRowLevelSecurityWhereClause('Membership Renewals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Membership Renewals', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [PersonLink_])
    async PersonLinks_MembershipMemberIDArray(@Root() member_: Member_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersonLinks] WHERE [MembershipMemberID]=${member_.MemberID} ` + this.getRowLevelSecurityWhereClause('Person Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Person Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Member_)
    async CreateMember(
        @Arg('input', () => CreateMemberInput) input: CreateMemberInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Members', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Member_)
    async UpdateMember(
        @Arg('input', () => UpdateMemberInput) input: UpdateMemberInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Members', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Member_)
    async DeleteMember(@Arg('MemberID', () => Int) MemberID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'MemberID', Value: MemberID}]);
        return this.DeleteRecord('Members', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organization Links
//****************************************************************************
@ObjectType({ description: `CompanyLink is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The CompanyLink table has entries for "matches" between records that represent companies/organizations across the different source systems so that we have a structured way to unify this data in the CDP.` })
export class OrganizationLink_ {
    @Field(() => Int) 
    OrganizationLinkID: number;
        
    @Field(() => Int, {nullable: true}) 
    MembershipCompanyID?: number;
        
    @Field(() => Int, {nullable: true}) 
    EventsOrganizationID?: number;
        
    @Field(() => Int, {nullable: true}) 
    EducationCompanyID?: number;
        
    @Field(() => Int, {nullable: true}) 
    CommunityCompanyID?: number;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Organization Links
//****************************************************************************
@InputType()
export class CreateOrganizationLinkInput {
    @Field(() => Int, { nullable: true })
    MembershipCompanyID: number | null;

    @Field(() => Int, { nullable: true })
    EventsOrganizationID: number | null;

    @Field(() => Int, { nullable: true })
    EducationCompanyID: number | null;

    @Field(() => Int, { nullable: true })
    CommunityCompanyID: number | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Organization Links
//****************************************************************************
@InputType()
export class UpdateOrganizationLinkInput {
    @Field(() => Int)
    OrganizationLinkID: number;

    @Field(() => Int, { nullable: true })
    MembershipCompanyID?: number | null;

    @Field(() => Int, { nullable: true })
    EventsOrganizationID?: number | null;

    @Field(() => Int, { nullable: true })
    EducationCompanyID?: number | null;

    @Field(() => Int, { nullable: true })
    CommunityCompanyID?: number | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organization Links
//****************************************************************************
@ObjectType()
export class RunOrganizationLinkViewResult {
    @Field(() => [OrganizationLink_])
    Results: OrganizationLink_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(OrganizationLink_)
export class OrganizationLinkResolver extends ResolverBase {
    @Query(() => RunOrganizationLinkViewResult)
    async RunOrganizationLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOrganizationLinkViewResult)
    async RunOrganizationLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOrganizationLinkViewResult)
    async RunOrganizationLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organization Links';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => OrganizationLink_, { nullable: true })
    async OrganizationLink(@Arg('OrganizationLinkID', () => Int) OrganizationLinkID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<OrganizationLink_ | null> {
        this.CheckUserReadPermissions('Organization Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizationLinks] WHERE [OrganizationLinkID]=${OrganizationLinkID} ` + this.getRowLevelSecurityWhereClause('Organization Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Organization Links', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => OrganizationLink_)
    async CreateOrganizationLink(
        @Arg('input', () => CreateOrganizationLinkInput) input: CreateOrganizationLinkInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Organization Links', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => OrganizationLink_)
    async UpdateOrganizationLink(
        @Arg('input', () => UpdateOrganizationLinkInput) input: UpdateOrganizationLinkInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Organization Links', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => OrganizationLink_)
    async DeleteOrganizationLink(@Arg('OrganizationLinkID', () => Int) OrganizationLinkID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'OrganizationLinkID', Value: OrganizationLinkID}]);
        return this.DeleteRecord('Organization Links', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Posts
//****************************************************************************
@ObjectType()
export class Post_ {
    @Field(() => Int) 
    PostID: number;
        
    @Field(() => Int) 
    ForumID: number;
        
    @Field(() => Int) 
    AuthorID: number;
        
    @Field({nullable: true}) 
    PostContent?: string;
        
    @Field() 
    @MaxLength(3)
    PostDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Reply_])
    Replies_PostIDArray: Reply_[]; // Link to Replies
    
}

//****************************************************************************
// INPUT TYPE for Posts
//****************************************************************************
@InputType()
export class CreatePostInput {
    @Field(() => Int, { nullable: true })
    ForumID?: number;

    @Field(() => Int, { nullable: true })
    AuthorID?: number;

    @Field({ nullable: true })
    PostContent: string | null;

    @Field({ nullable: true })
    PostDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Posts
//****************************************************************************
@InputType()
export class UpdatePostInput {
    @Field(() => Int)
    PostID: number;

    @Field(() => Int, { nullable: true })
    ForumID?: number;

    @Field(() => Int, { nullable: true })
    AuthorID?: number;

    @Field({ nullable: true })
    PostContent?: string | null;

    @Field({ nullable: true })
    PostDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Posts
//****************************************************************************
@ObjectType()
export class RunPostViewResult {
    @Field(() => [Post_])
    Results: Post_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Post_)
export class PostResolver extends ResolverBase {
    @Query(() => RunPostViewResult)
    async RunPostViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPostViewResult)
    async RunPostViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPostViewResult)
    async RunPostDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Posts';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Post_, { nullable: true })
    async Post(@Arg('PostID', () => Int) PostID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Post_ | null> {
        this.CheckUserReadPermissions('Posts', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwPosts] WHERE [PostID]=${PostID} ` + this.getRowLevelSecurityWhereClause('Posts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Posts', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Reply_])
    async Replies_PostIDArray(@Root() post_: Post_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Replies', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [community].[vwReplies] WHERE [PostID]=${post_.PostID} ` + this.getRowLevelSecurityWhereClause('Replies', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Replies', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Post_)
    async CreatePost(
        @Arg('input', () => CreatePostInput) input: CreatePostInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Posts', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Post_)
    async UpdatePost(
        @Arg('input', () => UpdatePostInput) input: UpdatePostInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Posts', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Post_)
    async DeletePost(@Arg('PostID', () => Int) PostID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'PostID', Value: PostID}]);
        return this.DeleteRecord('Posts', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Registrations__education
//****************************************************************************
@ObjectType()
export class Registration__education_ {
    @Field(() => Int) 
    RegistrationID: number;
        
    @Field(() => Int) 
    CourseID: number;
        
    @Field(() => Int) 
    StudentID: number;
        
    @Field() 
    @MaxLength(3)
    RegistrationDate: Date;
        
    @Field(() => Float, {nullable: true}) 
    RegistrationFee?: number;
        
    @Field({nullable: true, description: `Paid, Unpaid, Refunded`}) 
    @MaxLength(510)
    PaymentStatus?: string;
        
    @Field({nullable: true, description: `Pending, In Progress, Failed, Completed`}) 
    @MaxLength(510)
    CompletionStatus?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    CertificationAwarded?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Registrations__education
//****************************************************************************
@InputType()
export class CreateRegistration__educationInput {
    @Field(() => Int, { nullable: true })
    CourseID?: number;

    @Field(() => Int, { nullable: true })
    StudentID?: number;

    @Field({ nullable: true })
    RegistrationDate?: Date;

    @Field(() => Float, { nullable: true })
    RegistrationFee: number | null;

    @Field({ nullable: true })
    PaymentStatus: string | null;

    @Field({ nullable: true })
    CompletionStatus: string | null;

    @Field(() => Boolean, { nullable: true })
    CertificationAwarded: boolean | null;
}
    

//****************************************************************************
// INPUT TYPE for Registrations__education
//****************************************************************************
@InputType()
export class UpdateRegistration__educationInput {
    @Field(() => Int)
    RegistrationID: number;

    @Field(() => Int, { nullable: true })
    CourseID?: number;

    @Field(() => Int, { nullable: true })
    StudentID?: number;

    @Field({ nullable: true })
    RegistrationDate?: Date;

    @Field(() => Float, { nullable: true })
    RegistrationFee?: number | null;

    @Field({ nullable: true })
    PaymentStatus?: string | null;

    @Field({ nullable: true })
    CompletionStatus?: string | null;

    @Field(() => Boolean, { nullable: true })
    CertificationAwarded?: boolean | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Registrations__education
//****************************************************************************
@ObjectType()
export class RunRegistration__educationViewResult {
    @Field(() => [Registration__education_])
    Results: Registration__education_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Registration__education_)
export class Registration__educationResolver extends ResolverBase {
    @Query(() => RunRegistration__educationViewResult)
    async RunRegistration__educationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRegistration__educationViewResult)
    async RunRegistration__educationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRegistration__educationViewResult)
    async RunRegistration__educationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Registrations__education';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Registration__education_, { nullable: true })
    async Registration__education(@Arg('RegistrationID', () => Int) RegistrationID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Registration__education_ | null> {
        this.CheckUserReadPermissions('Registrations__education', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwRegistrations__education] WHERE [RegistrationID]=${RegistrationID} ` + this.getRowLevelSecurityWhereClause('Registrations__education', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Registrations__education', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Registration__education_)
    async CreateRegistration__education(
        @Arg('input', () => CreateRegistration__educationInput) input: CreateRegistration__educationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Registrations__education', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Registration__education_)
    async UpdateRegistration__education(
        @Arg('input', () => UpdateRegistration__educationInput) input: UpdateRegistration__educationInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Registrations__education', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Registration__education_)
    async DeleteRegistration__education(@Arg('RegistrationID', () => Int) RegistrationID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'RegistrationID', Value: RegistrationID}]);
        return this.DeleteRecord('Registrations__education', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Job Title Seeds
//****************************************************************************
@ObjectType()
export class JobTitleSeed_ {
    @Field(() => Int) 
    JobTitleID: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    JobTitle?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Job Title Seeds
//****************************************************************************
@InputType()
export class CreateJobTitleSeedInput {
    @Field({ nullable: true })
    JobTitle: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Job Title Seeds
//****************************************************************************
@InputType()
export class UpdateJobTitleSeedInput {
    @Field(() => Int)
    JobTitleID: number;

    @Field({ nullable: true })
    JobTitle?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Job Title Seeds
//****************************************************************************
@ObjectType()
export class RunJobTitleSeedViewResult {
    @Field(() => [JobTitleSeed_])
    Results: JobTitleSeed_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(JobTitleSeed_)
export class JobTitleSeedResolver extends ResolverBase {
    @Query(() => RunJobTitleSeedViewResult)
    async RunJobTitleSeedViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunJobTitleSeedViewResult)
    async RunJobTitleSeedViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunJobTitleSeedViewResult)
    async RunJobTitleSeedDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Job Title Seeds';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => JobTitleSeed_, { nullable: true })
    async JobTitleSeed(@Arg('JobTitleID', () => Int) JobTitleID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<JobTitleSeed_ | null> {
        this.CheckUserReadPermissions('Job Title Seeds', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [reference].[vwJobTitleSeeds] WHERE [JobTitleID]=${JobTitleID} ` + this.getRowLevelSecurityWhereClause('Job Title Seeds', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Job Title Seeds', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => JobTitleSeed_)
    async CreateJobTitleSeed(
        @Arg('input', () => CreateJobTitleSeedInput) input: CreateJobTitleSeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Job Title Seeds', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => JobTitleSeed_)
    async UpdateJobTitleSeed(
        @Arg('input', () => UpdateJobTitleSeedInput) input: UpdateJobTitleSeedInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Job Title Seeds', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => JobTitleSeed_)
    async DeleteJobTitleSeed(@Arg('JobTitleID', () => Int) JobTitleID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'JobTitleID', Value: JobTitleID}]);
        return this.DeleteRecord('Job Title Seeds', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Person Links
//****************************************************************************
@ObjectType({ description: `PersonLink is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The PersonLink table has entries for "matches" between records that represent people across the different source systems so that we have a structured way to unify this data in the CDP.` })
export class PersonLink_ {
    @Field(() => Int) 
    PersonLinkID: number;
        
    @Field(() => Int, {nullable: true}) 
    MembershipMemberID?: number;
        
    @Field(() => Int, {nullable: true}) 
    EventsAttendeeID?: number;
        
    @Field(() => Int, {nullable: true}) 
    EducationStudentID?: number;
        
    @Field(() => Int, {nullable: true}) 
    CommunityAuthorID?: number;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Person Links
//****************************************************************************
@InputType()
export class CreatePersonLinkInput {
    @Field(() => Int, { nullable: true })
    MembershipMemberID: number | null;

    @Field(() => Int, { nullable: true })
    EventsAttendeeID: number | null;

    @Field(() => Int, { nullable: true })
    EducationStudentID: number | null;

    @Field(() => Int, { nullable: true })
    CommunityAuthorID: number | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Person Links
//****************************************************************************
@InputType()
export class UpdatePersonLinkInput {
    @Field(() => Int)
    PersonLinkID: number;

    @Field(() => Int, { nullable: true })
    MembershipMemberID?: number | null;

    @Field(() => Int, { nullable: true })
    EventsAttendeeID?: number | null;

    @Field(() => Int, { nullable: true })
    EducationStudentID?: number | null;

    @Field(() => Int, { nullable: true })
    CommunityAuthorID?: number | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Person Links
//****************************************************************************
@ObjectType()
export class RunPersonLinkViewResult {
    @Field(() => [PersonLink_])
    Results: PersonLink_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(PersonLink_)
export class PersonLinkResolver extends ResolverBase {
    @Query(() => RunPersonLinkViewResult)
    async RunPersonLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonLinkViewResult)
    async RunPersonLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonLinkViewResult)
    async RunPersonLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Person Links';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => PersonLink_, { nullable: true })
    async PersonLink(@Arg('PersonLinkID', () => Int) PersonLinkID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<PersonLink_ | null> {
        this.CheckUserReadPermissions('Person Links', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersonLinks] WHERE [PersonLinkID]=${PersonLinkID} ` + this.getRowLevelSecurityWhereClause('Person Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Person Links', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => PersonLink_)
    async CreatePersonLink(
        @Arg('input', () => CreatePersonLinkInput) input: CreatePersonLinkInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Person Links', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => PersonLink_)
    async UpdatePersonLink(
        @Arg('input', () => UpdatePersonLinkInput) input: UpdatePersonLinkInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Person Links', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => PersonLink_)
    async DeletePersonLink(@Arg('PersonLinkID', () => Int) PersonLinkID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'PersonLinkID', Value: PersonLinkID}]);
        return this.DeleteRecord('Person Links', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Membership Renewals
//****************************************************************************
@ObjectType()
export class MembershipRenewal_ {
    @Field(() => Int) 
    RenewalID: number;
        
    @Field(() => Int) 
    MemberID: number;
        
    @Field() 
    @MaxLength(3)
    RenewalDate: Date;
        
    @Field(() => Float, {nullable: true}) 
    PaymentAmount?: number;
        
    @Field({nullable: true, description: `Pending, Completed, Refunded`}) 
    @MaxLength(510)
    PaymentStatus?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Membership Renewals
//****************************************************************************
@InputType()
export class CreateMembershipRenewalInput {
    @Field(() => Int, { nullable: true })
    MemberID?: number;

    @Field({ nullable: true })
    RenewalDate?: Date;

    @Field(() => Float, { nullable: true })
    PaymentAmount: number | null;

    @Field({ nullable: true })
    PaymentStatus: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Membership Renewals
//****************************************************************************
@InputType()
export class UpdateMembershipRenewalInput {
    @Field(() => Int)
    RenewalID: number;

    @Field(() => Int, { nullable: true })
    MemberID?: number;

    @Field({ nullable: true })
    RenewalDate?: Date;

    @Field(() => Float, { nullable: true })
    PaymentAmount?: number | null;

    @Field({ nullable: true })
    PaymentStatus?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Membership Renewals
//****************************************************************************
@ObjectType()
export class RunMembershipRenewalViewResult {
    @Field(() => [MembershipRenewal_])
    Results: MembershipRenewal_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(MembershipRenewal_)
export class MembershipRenewalResolver extends ResolverBase {
    @Query(() => RunMembershipRenewalViewResult)
    async RunMembershipRenewalViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMembershipRenewalViewResult)
    async RunMembershipRenewalViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMembershipRenewalViewResult)
    async RunMembershipRenewalDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Membership Renewals';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => MembershipRenewal_, { nullable: true })
    async MembershipRenewal(@Arg('RenewalID', () => Int) RenewalID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<MembershipRenewal_ | null> {
        this.CheckUserReadPermissions('Membership Renewals', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwMembershipRenewals] WHERE [RenewalID]=${RenewalID} ` + this.getRowLevelSecurityWhereClause('Membership Renewals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Membership Renewals', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => MembershipRenewal_)
    async CreateMembershipRenewal(
        @Arg('input', () => CreateMembershipRenewalInput) input: CreateMembershipRenewalInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Membership Renewals', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => MembershipRenewal_)
    async UpdateMembershipRenewal(
        @Arg('input', () => UpdateMembershipRenewalInput) input: UpdateMembershipRenewalInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Membership Renewals', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => MembershipRenewal_)
    async DeleteMembershipRenewal(@Arg('RenewalID', () => Int) RenewalID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'RenewalID', Value: RenewalID}]);
        return this.DeleteRecord('Membership Renewals', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Types
//****************************************************************************
@ObjectType()
export class MemberType_ {
    @Field(() => Int) 
    MemberTypeID: number;
        
    @Field() 
    @MaxLength(200)
    TypeName: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Float, {nullable: true}) 
    AnnualDues?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Member_])
    Members_MemberTypeIDArray: Member_[]; // Link to Members
    
}

//****************************************************************************
// INPUT TYPE for Member Types
//****************************************************************************
@InputType()
export class CreateMemberTypeInput {
    @Field({ nullable: true })
    TypeName?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    AnnualDues: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Types
//****************************************************************************
@InputType()
export class UpdateMemberTypeInput {
    @Field(() => Int)
    MemberTypeID: number;

    @Field({ nullable: true })
    TypeName?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    AnnualDues?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Types
//****************************************************************************
@ObjectType()
export class RunMemberTypeViewResult {
    @Field(() => [MemberType_])
    Results: MemberType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(MemberType_)
export class MemberTypeResolver extends ResolverBase {
    @Query(() => RunMemberTypeViewResult)
    async RunMemberTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMemberTypeViewResult)
    async RunMemberTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMemberTypeViewResult)
    async RunMemberTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => MemberType_, { nullable: true })
    async MemberType(@Arg('MemberTypeID', () => Int) MemberTypeID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<MemberType_ | null> {
        this.CheckUserReadPermissions('Member Types', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwMemberTypes] WHERE [MemberTypeID]=${MemberTypeID} ` + this.getRowLevelSecurityWhereClause('Member Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Member Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Member_])
    async Members_MemberTypeIDArray(@Root() membertype_: MemberType_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [membership].[vwMembers] WHERE [MemberTypeID]=${membertype_.MemberTypeID} ` + this.getRowLevelSecurityWhereClause('Members', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Members', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => MemberType_)
    async CreateMemberType(
        @Arg('input', () => CreateMemberTypeInput) input: CreateMemberTypeInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Member Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => MemberType_)
    async UpdateMemberType(
        @Arg('input', () => UpdateMemberTypeInput) input: UpdateMemberTypeInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Member Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => MemberType_)
    async DeleteMemberType(@Arg('MemberTypeID', () => Int) MemberTypeID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'MemberTypeID', Value: MemberTypeID}]);
        return this.DeleteRecord('Member Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Courses
//****************************************************************************
@ObjectType()
export class Course_ {
    @Field(() => Int) 
    CourseID: number;
        
    @Field() 
    @MaxLength(510)
    CourseName: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(3)
    StartDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    EndDate?: Date;
        
    @Field(() => Float, {nullable: true}) 
    MemberPrice?: number;
        
    @Field(() => Float, {nullable: true}) 
    NonMemberPrice?: number;
        
    @Field(() => Int, {nullable: true}) 
    InstructorID?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Registration__education_])
    Registrations__education_CourseIDArray: Registration__education_[]; // Link to Registrations__education
    
}

//****************************************************************************
// INPUT TYPE for Courses
//****************************************************************************
@InputType()
export class CreateCourseInput {
    @Field({ nullable: true })
    CourseName?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Float, { nullable: true })
    MemberPrice: number | null;

    @Field(() => Float, { nullable: true })
    NonMemberPrice: number | null;

    @Field(() => Int, { nullable: true })
    InstructorID: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Courses
//****************************************************************************
@InputType()
export class UpdateCourseInput {
    @Field(() => Int)
    CourseID: number;

    @Field({ nullable: true })
    CourseName?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Float, { nullable: true })
    MemberPrice?: number | null;

    @Field(() => Float, { nullable: true })
    NonMemberPrice?: number | null;

    @Field(() => Int, { nullable: true })
    InstructorID?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Courses
//****************************************************************************
@ObjectType()
export class RunCourseViewResult {
    @Field(() => [Course_])
    Results: Course_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Course_)
export class CourseResolver extends ResolverBase {
    @Query(() => RunCourseViewResult)
    async RunCourseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCourseViewResult)
    async RunCourseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCourseViewResult)
    async RunCourseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        input.EntityName = 'Courses';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Course_, { nullable: true })
    async Course(@Arg('CourseID', () => Int) CourseID: number, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Course_ | null> {
        this.CheckUserReadPermissions('Courses', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwCourses] WHERE [CourseID]=${CourseID} ` + this.getRowLevelSecurityWhereClause('Courses', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Courses', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Registration__education_])
    async Registrations__education_CourseIDArray(@Root() course_: Course_, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Registrations__education', userPayload);
        const dataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [education].[vwRegistrations__education] WHERE [CourseID]=${course_.CourseID} ` + this.getRowLevelSecurityWhereClause('Registrations__education', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Registrations__education', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Course_)
    async CreateCourse(
        @Arg('input', () => CreateCourseInput) input: CreateCourseInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.CreateRecord('Courses', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Course_)
    async UpdateCourse(
        @Arg('input', () => UpdateCourseInput) input: UpdateCourseInput,
        @Ctx() { dataSources, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const dataSource = GetReadWriteDataSource(dataSources);
        return this.UpdateRecord('Courses', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Course_)
    async DeleteCourse(@Arg('CourseID', () => Int) CourseID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSources, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const dataSource = GetReadWriteDataSource(dataSources);
        const key = new CompositeKey([{FieldName: 'CourseID', Value: CourseID}]);
        return this.DeleteRecord('Courses', key, options, dataSource, userPayload, pubSub);
    }
    
}