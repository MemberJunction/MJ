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


import { AgentEntity, AuthorEntity, BookCopyEntity, BookEntity, BranchEntity, CampaignEntity, CategoryEntity, CheckoutEntity, ClassBookingEntity, ClientEntity, CustomerOrderEntity, DailyRevenueEntity, DepartmentEntity, DonationEntity, DonorEntity, EventAttendeeEntity, EventEntity, FineEntity, FitnessClassEntity, GenreEntity, Grant_Entity, InspectionEntity, KnowledgeArticleEntity, LeaseEntity, LocationEntity, MaintenanceRequestEntity, MemberMeasurementEntity, MemberEntity, MembershipTierEntity, MenuCategoryEntity, MenuItemEntity, OfferEntity, OpenHouseEntity, OrderItemEntity, OwnerEntity, PatronEntity, PaymentEntity, Payment__sample_propertyEntity, PersonalTrainingSessionEntity, PriorityEntity, PropertyEntity, Property__sample_propertyEntity, PropertyImageEntity, PropertyTypeEntity, PropertyType__sample_propertyEntity, ReservationEntity, ShowingEntity, StaffEntity, SupportAgentEntity, TableSeatingEntity, TenantEntity, TicketAttachmentEntity, TicketCommentEntity, TicketTagEntity, TicketEntity, TrainerEntity, TransactionEntity, VolunteerLogEntity, VolunteerEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Agents
//****************************************************************************
@ObjectType({ description: `Real estate agents and brokers` })
export class samplereAgent_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field({description: `State license number for the agent`}) 
    @MaxLength(30)
    LicenseNumber: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(8)
    HireDate: Date;
        
    @Field(() => Float, {description: `Default commission percentage for this agent`}) 
    CommissionRate: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplereClient_])
    Clients_AgentIDArray: samplereClient_[]; // Link to Clients
    
    @Field(() => [samplereOpenHouse_])
    OpenHouses_AgentIDArray: samplereOpenHouse_[]; // Link to OpenHouses
    
    @Field(() => [samplereShowing_])
    Showings_AgentIDArray: samplereShowing_[]; // Link to Showings
    
    @Field(() => [samplereTransaction_])
    Transactions_SellerAgentIDArray: samplereTransaction_[]; // Link to Transactions
    
    @Field(() => [samplereProperty_])
    Properties_AgentIDArray: samplereProperty_[]; // Link to Properties
    
    @Field(() => [samplereTransaction_])
    Transactions_BuyerAgentIDArray: samplereTransaction_[]; // Link to Transactions
    
}

//****************************************************************************
// INPUT TYPE for Agents
//****************************************************************************
@InputType()
export class CreatesamplereAgentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    LicenseNumber?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => Float, { nullable: true })
    CommissionRate?: number;
}
    

//****************************************************************************
// INPUT TYPE for Agents
//****************************************************************************
@InputType()
export class UpdatesamplereAgentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    LicenseNumber?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => Float, { nullable: true })
    CommissionRate?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Agents
//****************************************************************************
@ObjectType()
export class RunsamplereAgentViewResult {
    @Field(() => [samplereAgent_])
    Results: samplereAgent_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereAgent_)
export class samplereAgentResolver extends ResolverBase {
    @Query(() => RunsamplereAgentViewResult)
    async RunsamplereAgentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereAgentViewResult)
    async RunsamplereAgentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereAgentViewResult)
    async RunsamplereAgentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Agents';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereAgent_, { nullable: true })
    async samplereAgent(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereAgent_ | null> {
        this.CheckUserReadPermissions('Agents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwAgents] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Agents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Agents', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplereClient_])
    async Clients_AgentIDArray(@Root() samplereagent_: samplereAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Clients', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwClients] WHERE [AgentID]='${samplereagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Clients', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Clients', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereOpenHouse_])
    async OpenHouses_AgentIDArray(@Root() samplereagent_: samplereAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Open Houses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwOpenHouses] WHERE [AgentID]='${samplereagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Open Houses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Open Houses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereShowing_])
    async Showings_AgentIDArray(@Root() samplereagent_: samplereAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Showings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwShowings] WHERE [AgentID]='${samplereagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Showings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Showings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereTransaction_])
    async Transactions_SellerAgentIDArray(@Root() samplereagent_: samplereAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwTransactions] WHERE [SellerAgentID]='${samplereagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereProperty_])
    async Properties_AgentIDArray(@Root() samplereagent_: samplereAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Properties', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwProperties] WHERE [AgentID]='${samplereagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Properties', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Properties', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereTransaction_])
    async Transactions_BuyerAgentIDArray(@Root() samplereagent_: samplereAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwTransactions] WHERE [BuyerAgentID]='${samplereagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplereAgent_)
    async CreatesamplereAgent(
        @Arg('input', () => CreatesamplereAgentInput) input: CreatesamplereAgentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Agents', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereAgent_)
    async UpdatesamplereAgent(
        @Arg('input', () => UpdatesamplereAgentInput) input: UpdatesamplereAgentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Agents', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereAgent_)
    async DeletesamplereAgent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Agents', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Authors
//****************************************************************************
@ObjectType({ description: `Book authors` })
export class samplelibAuthor_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field(() => Int, {nullable: true}) 
    BirthYear?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Nationality?: string;
        
    @Field({nullable: true}) 
    Bio?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplelibBook_])
    Books_AuthorIDArray: samplelibBook_[]; // Link to Books
    
}

//****************************************************************************
// INPUT TYPE for Authors
//****************************************************************************
@InputType()
export class CreatesamplelibAuthorInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field(() => Int, { nullable: true })
    BirthYear: number | null;

    @Field({ nullable: true })
    Nationality: string | null;

    @Field({ nullable: true })
    Bio: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Authors
//****************************************************************************
@InputType()
export class UpdatesamplelibAuthorInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field(() => Int, { nullable: true })
    BirthYear?: number | null;

    @Field({ nullable: true })
    Nationality?: string | null;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Authors
//****************************************************************************
@ObjectType()
export class RunsamplelibAuthorViewResult {
    @Field(() => [samplelibAuthor_])
    Results: samplelibAuthor_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibAuthor_)
export class samplelibAuthorResolver extends ResolverBase {
    @Query(() => RunsamplelibAuthorViewResult)
    async RunsamplelibAuthorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibAuthorViewResult)
    async RunsamplelibAuthorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibAuthorViewResult)
    async RunsamplelibAuthorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Authors';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibAuthor_, { nullable: true })
    async samplelibAuthor(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibAuthor_ | null> {
        this.CheckUserReadPermissions('Authors', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwAuthors] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Authors', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Authors', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibBook_])
    async Books_AuthorIDArray(@Root() samplelibauthor_: samplelibAuthor_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Books', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBooks] WHERE [AuthorID]='${samplelibauthor_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Books', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Books', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibAuthor_)
    async CreatesamplelibAuthor(
        @Arg('input', () => CreatesamplelibAuthorInput) input: CreatesamplelibAuthorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Authors', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibAuthor_)
    async UpdatesamplelibAuthor(
        @Arg('input', () => UpdatesamplelibAuthorInput) input: UpdatesamplelibAuthorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Authors', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibAuthor_)
    async DeletesamplelibAuthor(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Authors', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Book Copies
//****************************************************************************
@ObjectType({ description: `Physical copies of books at branches` })
export class samplelibBookCopy_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    BookID: string;
        
    @Field() 
    @MaxLength(16)
    BranchID: string;
        
    @Field({description: `Unique barcode for physical copy tracking`}) 
    @MaxLength(30)
    Barcode: string;
        
    @Field({description: `Physical condition of the copy`}) 
    @MaxLength(20)
    Condition: string;
        
    @Field() 
    @MaxLength(3)
    AcquiredDate: Date;
        
    @Field(() => Boolean, {description: `Whether the copy is available for checkout`}) 
    IsAvailable: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Branch: string;
        
    @Field(() => [samplelibCheckout_])
    Checkouts_BookCopyIDArray: samplelibCheckout_[]; // Link to Checkouts
    
}

//****************************************************************************
// INPUT TYPE for Book Copies
//****************************************************************************
@InputType()
export class CreatesamplelibBookCopyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BookID?: string;

    @Field({ nullable: true })
    BranchID?: string;

    @Field({ nullable: true })
    Barcode?: string;

    @Field({ nullable: true })
    Condition?: string;

    @Field({ nullable: true })
    AcquiredDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Book Copies
//****************************************************************************
@InputType()
export class UpdatesamplelibBookCopyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BookID?: string;

    @Field({ nullable: true })
    BranchID?: string;

    @Field({ nullable: true })
    Barcode?: string;

    @Field({ nullable: true })
    Condition?: string;

    @Field({ nullable: true })
    AcquiredDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Book Copies
//****************************************************************************
@ObjectType()
export class RunsamplelibBookCopyViewResult {
    @Field(() => [samplelibBookCopy_])
    Results: samplelibBookCopy_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibBookCopy_)
export class samplelibBookCopyResolver extends ResolverBase {
    @Query(() => RunsamplelibBookCopyViewResult)
    async RunsamplelibBookCopyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibBookCopyViewResult)
    async RunsamplelibBookCopyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibBookCopyViewResult)
    async RunsamplelibBookCopyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Book Copies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibBookCopy_, { nullable: true })
    async samplelibBookCopy(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibBookCopy_ | null> {
        this.CheckUserReadPermissions('Book Copies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBookCopies] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Book Copies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Book Copies', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibCheckout_])
    async Checkouts_BookCopyIDArray(@Root() samplelibbookcopy_: samplelibBookCopy_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Checkouts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwCheckouts] WHERE [BookCopyID]='${samplelibbookcopy_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Checkouts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Checkouts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibBookCopy_)
    async CreatesamplelibBookCopy(
        @Arg('input', () => CreatesamplelibBookCopyInput) input: CreatesamplelibBookCopyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Book Copies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibBookCopy_)
    async UpdatesamplelibBookCopy(
        @Arg('input', () => UpdatesamplelibBookCopyInput) input: UpdatesamplelibBookCopyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Book Copies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibBookCopy_)
    async DeletesamplelibBookCopy(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Book Copies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Books
//****************************************************************************
@ObjectType({ description: `Catalog of books in the library system` })
export class samplelibBook_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `International Standard Book Number`}) 
    @MaxLength(13)
    ISBN: string;
        
    @Field() 
    @MaxLength(600)
    Title: string;
        
    @Field(() => Int) 
    PublicationYear: number;
        
    @Field() 
    @MaxLength(400)
    Publisher: string;
        
    @Field(() => Int, {nullable: true}) 
    PageCount?: number;
        
    @Field() 
    @MaxLength(30)
    Language: string;
        
    @Field() 
    @MaxLength(16)
    GenreID: string;
        
    @Field() 
    @MaxLength(16)
    AuthorID: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(8)
    AddedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Genre: string;
        
    @Field(() => [samplelibBookCopy_])
    BookCopies_BookIDArray: samplelibBookCopy_[]; // Link to BookCopies
    
}

//****************************************************************************
// INPUT TYPE for Books
//****************************************************************************
@InputType()
export class CreatesamplelibBookInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ISBN?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field(() => Int, { nullable: true })
    PublicationYear?: number;

    @Field({ nullable: true })
    Publisher?: string;

    @Field(() => Int, { nullable: true })
    PageCount: number | null;

    @Field({ nullable: true })
    Language?: string;

    @Field({ nullable: true })
    GenreID?: string;

    @Field({ nullable: true })
    AuthorID?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    AddedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Books
//****************************************************************************
@InputType()
export class UpdatesamplelibBookInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ISBN?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field(() => Int, { nullable: true })
    PublicationYear?: number;

    @Field({ nullable: true })
    Publisher?: string;

    @Field(() => Int, { nullable: true })
    PageCount?: number | null;

    @Field({ nullable: true })
    Language?: string;

    @Field({ nullable: true })
    GenreID?: string;

    @Field({ nullable: true })
    AuthorID?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    AddedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Books
//****************************************************************************
@ObjectType()
export class RunsamplelibBookViewResult {
    @Field(() => [samplelibBook_])
    Results: samplelibBook_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibBook_)
export class samplelibBookResolver extends ResolverBase {
    @Query(() => RunsamplelibBookViewResult)
    async RunsamplelibBookViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibBookViewResult)
    async RunsamplelibBookViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibBookViewResult)
    async RunsamplelibBookDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Books';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibBook_, { nullable: true })
    async samplelibBook(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibBook_ | null> {
        this.CheckUserReadPermissions('Books', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBooks] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Books', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Books', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibBookCopy_])
    async BookCopies_BookIDArray(@Root() samplelibbook_: samplelibBook_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Book Copies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBookCopies] WHERE [BookID]='${samplelibbook_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Book Copies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Book Copies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibBook_)
    async CreatesamplelibBook(
        @Arg('input', () => CreatesamplelibBookInput) input: CreatesamplelibBookInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Books', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibBook_)
    async UpdatesamplelibBook(
        @Arg('input', () => UpdatesamplelibBookInput) input: UpdatesamplelibBookInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Books', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibBook_)
    async DeletesamplelibBook(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Books', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Branches
//****************************************************************************
@ObjectType({ description: `Library branch locations` })
export class samplelibBranch_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field() 
    @MaxLength(600)
    Address: string;
        
    @Field() 
    @MaxLength(200)
    City: string;
        
    @Field() 
    @MaxLength(2)
    State: string;
        
    @Field() 
    @MaxLength(10)
    ZipCode: string;
        
    @Field() 
    @MaxLength(20)
    Phone: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Email?: string;
        
    @Field(() => Int) 
    OpeningYear: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplelibPatron_])
    Patrons_HomeBranchIDArray: samplelibPatron_[]; // Link to Patrons
    
    @Field(() => [samplelibBookCopy_])
    BookCopies_BranchIDArray: samplelibBookCopy_[]; // Link to BookCopies
    
}

//****************************************************************************
// INPUT TYPE for Branches
//****************************************************************************
@InputType()
export class CreatesamplelibBranchInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field(() => Int, { nullable: true })
    OpeningYear?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Branches
//****************************************************************************
@InputType()
export class UpdatesamplelibBranchInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field(() => Int, { nullable: true })
    OpeningYear?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Branches
//****************************************************************************
@ObjectType()
export class RunsamplelibBranchViewResult {
    @Field(() => [samplelibBranch_])
    Results: samplelibBranch_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibBranch_)
export class samplelibBranchResolver extends ResolverBase {
    @Query(() => RunsamplelibBranchViewResult)
    async RunsamplelibBranchViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibBranchViewResult)
    async RunsamplelibBranchViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibBranchViewResult)
    async RunsamplelibBranchDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Branches';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibBranch_, { nullable: true })
    async samplelibBranch(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibBranch_ | null> {
        this.CheckUserReadPermissions('Branches', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBranches] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Branches', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Branches', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibPatron_])
    async Patrons_HomeBranchIDArray(@Root() samplelibbranch_: samplelibBranch_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Patrons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwPatrons] WHERE [HomeBranchID]='${samplelibbranch_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Patrons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Patrons', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplelibBookCopy_])
    async BookCopies_BranchIDArray(@Root() samplelibbranch_: samplelibBranch_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Book Copies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBookCopies] WHERE [BranchID]='${samplelibbranch_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Book Copies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Book Copies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibBranch_)
    async CreatesamplelibBranch(
        @Arg('input', () => CreatesamplelibBranchInput) input: CreatesamplelibBranchInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Branches', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibBranch_)
    async UpdatesamplelibBranch(
        @Arg('input', () => UpdatesamplelibBranchInput) input: UpdatesamplelibBranchInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Branches', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibBranch_)
    async DeletesamplelibBranch(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Branches', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Campaigns
//****************************************************************************
@ObjectType({ description: `Fundraising campaigns with goals and timelines` })
export class samplenpoCampaign_ {
    @Field({description: `Unique identifier for the campaign`}) 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field() 
    Description: string;
        
    @Field(() => Float, {description: `Target fundraising amount for the campaign`}) 
    GoalAmount: number;
        
    @Field() 
    @MaxLength(3)
    StartDate: Date;
        
    @Field() 
    @MaxLength(3)
    EndDate: Date;
        
    @Field({description: `Current status: Planning, Active, Completed, or Cancelled`}) 
    @MaxLength(20)
    Status: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplenpoGrant_])
    Grant_s_CampaignIDArray: samplenpoGrant_[]; // Link to Grant_s
    
    @Field(() => [samplenpoEvent_])
    Events_CampaignIDArray: samplenpoEvent_[]; // Link to Events
    
    @Field(() => [samplenpoDonation_])
    Donations_CampaignIDArray: samplenpoDonation_[]; // Link to Donations
    
}

//****************************************************************************
// INPUT TYPE for Campaigns
//****************************************************************************
@InputType()
export class CreatesamplenpoCampaignInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Float, { nullable: true })
    GoalAmount?: number;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Campaigns
//****************************************************************************
@InputType()
export class UpdatesamplenpoCampaignInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Float, { nullable: true })
    GoalAmount?: number;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Campaigns
//****************************************************************************
@ObjectType()
export class RunsamplenpoCampaignViewResult {
    @Field(() => [samplenpoCampaign_])
    Results: samplenpoCampaign_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoCampaign_)
export class samplenpoCampaignResolver extends ResolverBase {
    @Query(() => RunsamplenpoCampaignViewResult)
    async RunsamplenpoCampaignViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoCampaignViewResult)
    async RunsamplenpoCampaignViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoCampaignViewResult)
    async RunsamplenpoCampaignDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Campaigns';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoCampaign_, { nullable: true })
    async samplenpoCampaign(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoCampaign_ | null> {
        this.CheckUserReadPermissions('Campaigns', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwCampaigns] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Campaigns', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Campaigns', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplenpoGrant_])
    async Grant_s_CampaignIDArray(@Root() samplenpocampaign_: samplenpoCampaign_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Grant _s', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwGrant_s] WHERE [CampaignID]='${samplenpocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Grant _s', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Grant _s', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplenpoEvent_])
    async Events_CampaignIDArray(@Root() samplenpocampaign_: samplenpoCampaign_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwEvents] WHERE [CampaignID]='${samplenpocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Events', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplenpoDonation_])
    async Donations_CampaignIDArray(@Root() samplenpocampaign_: samplenpoCampaign_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwDonations] WHERE [CampaignID]='${samplenpocampaign_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Donations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplenpoCampaign_)
    async CreatesamplenpoCampaign(
        @Arg('input', () => CreatesamplenpoCampaignInput) input: CreatesamplenpoCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Campaigns', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoCampaign_)
    async UpdatesamplenpoCampaign(
        @Arg('input', () => UpdatesamplenpoCampaignInput) input: UpdatesamplenpoCampaignInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Campaigns', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoCampaign_)
    async DeletesamplenpoCampaign(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Campaigns', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Categories
//****************************************************************************
@ObjectType({ description: `Hierarchical ticket categories for classification` })
export class samplehdCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(300)
    Name: string;
        
    @Field({nullable: true, description: `Self-referencing FK for category hierarchy`}) 
    @MaxLength(16)
    ParentCategoryID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    DepartmentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(300)
    ParentCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(300)
    Department?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootParentCategoryID?: string;
        
    @Field(() => [samplehdCategory_])
    Categories_ParentCategoryIDArray: samplehdCategory_[]; // Link to Categories
    
    @Field(() => [samplehdTicket_])
    Tickets_CategoryIDArray: samplehdTicket_[]; // Link to Tickets
    
    @Field(() => [samplehdKnowledgeArticle_])
    KnowledgeArticles_CategoryIDArray: samplehdKnowledgeArticle_[]; // Link to KnowledgeArticles
    
}

//****************************************************************************
// INPUT TYPE for Categories
//****************************************************************************
@InputType()
export class CreatesamplehdCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ParentCategoryID: string | null;

    @Field({ nullable: true })
    DepartmentID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Categories
//****************************************************************************
@InputType()
export class UpdatesamplehdCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ParentCategoryID?: string | null;

    @Field({ nullable: true })
    DepartmentID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Categories
//****************************************************************************
@ObjectType()
export class RunsamplehdCategoryViewResult {
    @Field(() => [samplehdCategory_])
    Results: samplehdCategory_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdCategory_)
export class samplehdCategoryResolver extends ResolverBase {
    @Query(() => RunsamplehdCategoryViewResult)
    async RunsamplehdCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdCategoryViewResult)
    async RunsamplehdCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdCategoryViewResult)
    async RunsamplehdCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdCategory_, { nullable: true })
    async samplehdCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdCategory_ | null> {
        this.CheckUserReadPermissions('Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplehdCategory_])
    async Categories_ParentCategoryIDArray(@Root() samplehdcategory_: samplehdCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwCategories] WHERE [ParentCategoryID]='${samplehdcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplehdTicket_])
    async Tickets_CategoryIDArray(@Root() samplehdcategory_: samplehdCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTickets] WHERE [CategoryID]='${samplehdcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplehdKnowledgeArticle_])
    async KnowledgeArticles_CategoryIDArray(@Root() samplehdcategory_: samplehdCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Knowledge Articles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwKnowledgeArticles] WHERE [CategoryID]='${samplehdcategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Knowledge Articles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Knowledge Articles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplehdCategory_)
    async CreatesamplehdCategory(
        @Arg('input', () => CreatesamplehdCategoryInput) input: CreatesamplehdCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdCategory_)
    async UpdatesamplehdCategory(
        @Arg('input', () => UpdatesamplehdCategoryInput) input: UpdatesamplehdCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdCategory_)
    async DeletesamplehdCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Checkouts
//****************************************************************************
@ObjectType({ description: `Book checkout records` })
export class samplelibCheckout_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    BookCopyID: string;
        
    @Field() 
    @MaxLength(16)
    PatronID: string;
        
    @Field() 
    @MaxLength(8)
    CheckoutDate: Date;
        
    @Field({description: `Expected return date for the checked out book`}) 
    @MaxLength(3)
    DueDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ReturnDate?: Date;
        
    @Field(() => Boolean) 
    IsReturned: boolean;
        
    @Field(() => Float, {description: `Fee charged for late return`}) 
    LateFee: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplelibFine_])
    Fines_CheckoutIDArray: samplelibFine_[]; // Link to Fines
    
}

//****************************************************************************
// INPUT TYPE for Checkouts
//****************************************************************************
@InputType()
export class CreatesamplelibCheckoutInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BookCopyID?: string;

    @Field({ nullable: true })
    PatronID?: string;

    @Field({ nullable: true })
    CheckoutDate?: Date;

    @Field({ nullable: true })
    DueDate?: Date;

    @Field({ nullable: true })
    ReturnDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsReturned?: boolean;

    @Field(() => Float, { nullable: true })
    LateFee?: number;
}
    

//****************************************************************************
// INPUT TYPE for Checkouts
//****************************************************************************
@InputType()
export class UpdatesamplelibCheckoutInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BookCopyID?: string;

    @Field({ nullable: true })
    PatronID?: string;

    @Field({ nullable: true })
    CheckoutDate?: Date;

    @Field({ nullable: true })
    DueDate?: Date;

    @Field({ nullable: true })
    ReturnDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsReturned?: boolean;

    @Field(() => Float, { nullable: true })
    LateFee?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Checkouts
//****************************************************************************
@ObjectType()
export class RunsamplelibCheckoutViewResult {
    @Field(() => [samplelibCheckout_])
    Results: samplelibCheckout_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibCheckout_)
export class samplelibCheckoutResolver extends ResolverBase {
    @Query(() => RunsamplelibCheckoutViewResult)
    async RunsamplelibCheckoutViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibCheckoutViewResult)
    async RunsamplelibCheckoutViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibCheckoutViewResult)
    async RunsamplelibCheckoutDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Checkouts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibCheckout_, { nullable: true })
    async samplelibCheckout(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibCheckout_ | null> {
        this.CheckUserReadPermissions('Checkouts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwCheckouts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Checkouts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Checkouts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibFine_])
    async Fines_CheckoutIDArray(@Root() samplelibcheckout_: samplelibCheckout_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Fines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwFines] WHERE [CheckoutID]='${samplelibcheckout_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Fines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Fines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibCheckout_)
    async CreatesamplelibCheckout(
        @Arg('input', () => CreatesamplelibCheckoutInput) input: CreatesamplelibCheckoutInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Checkouts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibCheckout_)
    async UpdatesamplelibCheckout(
        @Arg('input', () => UpdatesamplelibCheckoutInput) input: UpdatesamplelibCheckoutInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Checkouts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibCheckout_)
    async DeletesamplelibCheckout(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Checkouts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Class Bookings
//****************************************************************************
@ObjectType({ description: `Member bookings for group fitness classes` })
export class samplefitClassBooking_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    ClassID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(3)
    BookingDate: Date;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field(() => Boolean) 
    CheckedIn: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    CancelledAt?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Class: string;
        
}

//****************************************************************************
// INPUT TYPE for Class Bookings
//****************************************************************************
@InputType()
export class CreatesamplefitClassBookingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ClassID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    BookingDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    CheckedIn?: boolean;

    @Field({ nullable: true })
    CancelledAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Class Bookings
//****************************************************************************
@InputType()
export class UpdatesamplefitClassBookingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ClassID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    BookingDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Boolean, { nullable: true })
    CheckedIn?: boolean;

    @Field({ nullable: true })
    CancelledAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Class Bookings
//****************************************************************************
@ObjectType()
export class RunsamplefitClassBookingViewResult {
    @Field(() => [samplefitClassBooking_])
    Results: samplefitClassBooking_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitClassBooking_)
export class samplefitClassBookingResolver extends ResolverBase {
    @Query(() => RunsamplefitClassBookingViewResult)
    async RunsamplefitClassBookingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitClassBookingViewResult)
    async RunsamplefitClassBookingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitClassBookingViewResult)
    async RunsamplefitClassBookingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Class Bookings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitClassBooking_, { nullable: true })
    async samplefitClassBooking(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitClassBooking_ | null> {
        this.CheckUserReadPermissions('Class Bookings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwClassBookings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Class Bookings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Class Bookings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplefitClassBooking_)
    async CreatesamplefitClassBooking(
        @Arg('input', () => CreatesamplefitClassBookingInput) input: CreatesamplefitClassBookingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Class Bookings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitClassBooking_)
    async UpdatesamplefitClassBooking(
        @Arg('input', () => UpdatesamplefitClassBookingInput) input: UpdatesamplefitClassBookingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Class Bookings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitClassBooking_)
    async DeletesamplefitClassBooking(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Class Bookings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Clients
//****************************************************************************
@ObjectType({ description: `Prospective buyers and renters` })
export class samplereClient_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field({description: `Preferred method of contact: Email, Phone, or Text`}) 
    @MaxLength(10)
    PreferredContactMethod: string;
        
    @Field(() => Float, {nullable: true, description: `Maximum budget for property search`}) 
    Budget?: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(16)
    AgentID: string;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplereOffer_])
    Offers_ClientIDArray: samplereOffer_[]; // Link to Offers
    
    @Field(() => [samplereShowing_])
    Showings_ClientIDArray: samplereShowing_[]; // Link to Showings
    
    @Field(() => [samplereTransaction_])
    Transactions_BuyerIDArray: samplereTransaction_[]; // Link to Transactions
    
}

//****************************************************************************
// INPUT TYPE for Clients
//****************************************************************************
@InputType()
export class CreatesamplereClientInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    PreferredContactMethod?: string;

    @Field(() => Float, { nullable: true })
    Budget: number | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Clients
//****************************************************************************
@InputType()
export class UpdatesamplereClientInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    PreferredContactMethod?: string;

    @Field(() => Float, { nullable: true })
    Budget?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Clients
//****************************************************************************
@ObjectType()
export class RunsamplereClientViewResult {
    @Field(() => [samplereClient_])
    Results: samplereClient_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereClient_)
export class samplereClientResolver extends ResolverBase {
    @Query(() => RunsamplereClientViewResult)
    async RunsamplereClientViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereClientViewResult)
    async RunsamplereClientViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereClientViewResult)
    async RunsamplereClientDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Clients';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereClient_, { nullable: true })
    async samplereClient(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereClient_ | null> {
        this.CheckUserReadPermissions('Clients', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwClients] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Clients', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Clients', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplereOffer_])
    async Offers_ClientIDArray(@Root() samplereclient_: samplereClient_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Offers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwOffers] WHERE [ClientID]='${samplereclient_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Offers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Offers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereShowing_])
    async Showings_ClientIDArray(@Root() samplereclient_: samplereClient_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Showings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwShowings] WHERE [ClientID]='${samplereclient_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Showings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Showings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereTransaction_])
    async Transactions_BuyerIDArray(@Root() samplereclient_: samplereClient_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwTransactions] WHERE [BuyerID]='${samplereclient_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplereClient_)
    async CreatesamplereClient(
        @Arg('input', () => CreatesamplereClientInput) input: CreatesamplereClientInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Clients', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereClient_)
    async UpdatesamplereClient(
        @Arg('input', () => UpdatesamplereClientInput) input: UpdatesamplereClientInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Clients', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereClient_)
    async DeletesamplereClient(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Clients', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Customer Orders
//****************************************************************************
@ObjectType({ description: `Customer orders placed at tables` })
export class samplerestCustomerOrder_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Unique sequential order identifier`}) 
    @MaxLength(20)
    OrderNumber: string;
        
    @Field() 
    @MaxLength(16)
    TableID: string;
        
    @Field() 
    @MaxLength(16)
    ServerID: string;
        
    @Field() 
    @MaxLength(8)
    OrderDate: Date;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field(() => Float) 
    SubTotal: number;
        
    @Field(() => Float) 
    TaxAmount: number;
        
    @Field(() => Float) 
    TipAmount: number;
        
    @Field(() => Float, {description: `Order total including tax and tip`}) 
    TotalAmount: number;
        
    @Field(() => Boolean) 
    IsPaid: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    PaidAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    PaymentMethod?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplerestOrderItem_])
    OrderItems_OrderIDArray: samplerestOrderItem_[]; // Link to OrderItems
    
}

//****************************************************************************
// INPUT TYPE for Customer Orders
//****************************************************************************
@InputType()
export class CreatesamplerestCustomerOrderInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderNumber?: string;

    @Field({ nullable: true })
    TableID?: string;

    @Field({ nullable: true })
    ServerID?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    SubTotal?: number;

    @Field(() => Float, { nullable: true })
    TaxAmount?: number;

    @Field(() => Float, { nullable: true })
    TipAmount?: number;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number;

    @Field(() => Boolean, { nullable: true })
    IsPaid?: boolean;

    @Field({ nullable: true })
    PaidAt: Date | null;

    @Field({ nullable: true })
    PaymentMethod: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Customer Orders
//****************************************************************************
@InputType()
export class UpdatesamplerestCustomerOrderInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderNumber?: string;

    @Field({ nullable: true })
    TableID?: string;

    @Field({ nullable: true })
    ServerID?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    SubTotal?: number;

    @Field(() => Float, { nullable: true })
    TaxAmount?: number;

    @Field(() => Float, { nullable: true })
    TipAmount?: number;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number;

    @Field(() => Boolean, { nullable: true })
    IsPaid?: boolean;

    @Field({ nullable: true })
    PaidAt?: Date | null;

    @Field({ nullable: true })
    PaymentMethod?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Customer Orders
//****************************************************************************
@ObjectType()
export class RunsamplerestCustomerOrderViewResult {
    @Field(() => [samplerestCustomerOrder_])
    Results: samplerestCustomerOrder_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestCustomerOrder_)
export class samplerestCustomerOrderResolver extends ResolverBase {
    @Query(() => RunsamplerestCustomerOrderViewResult)
    async RunsamplerestCustomerOrderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestCustomerOrderViewResult)
    async RunsamplerestCustomerOrderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestCustomerOrderViewResult)
    async RunsamplerestCustomerOrderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Customer Orders';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestCustomerOrder_, { nullable: true })
    async samplerestCustomerOrder(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestCustomerOrder_ | null> {
        this.CheckUserReadPermissions('Customer Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwCustomerOrders] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Customer Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Customer Orders', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplerestOrderItem_])
    async OrderItems_OrderIDArray(@Root() samplerestcustomerorder_: samplerestCustomerOrder_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Order Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwOrderItems] WHERE [OrderID]='${samplerestcustomerorder_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Order Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Order Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplerestCustomerOrder_)
    async CreatesamplerestCustomerOrder(
        @Arg('input', () => CreatesamplerestCustomerOrderInput) input: CreatesamplerestCustomerOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Customer Orders', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestCustomerOrder_)
    async UpdatesamplerestCustomerOrder(
        @Arg('input', () => UpdatesamplerestCustomerOrderInput) input: UpdatesamplerestCustomerOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Customer Orders', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestCustomerOrder_)
    async DeletesamplerestCustomerOrder(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Customer Orders', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Daily Revenues
//****************************************************************************
@ObjectType({ description: `Daily aggregated revenue and performance data` })
export class samplerestDailyRevenue_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Calendar date for revenue aggregation`}) 
    @MaxLength(3)
    BusinessDate: Date;
        
    @Field(() => Int) 
    TotalOrders: number;
        
    @Field(() => Float) 
    TotalRevenue: number;
        
    @Field(() => Float) 
    TotalTips: number;
        
    @Field(() => Int) 
    CustomerCount: number;
        
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
// INPUT TYPE for Daily Revenues
//****************************************************************************
@InputType()
export class CreatesamplerestDailyRevenueInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BusinessDate?: Date;

    @Field(() => Int, { nullable: true })
    TotalOrders?: number;

    @Field(() => Float, { nullable: true })
    TotalRevenue?: number;

    @Field(() => Float, { nullable: true })
    TotalTips?: number;

    @Field(() => Int, { nullable: true })
    CustomerCount?: number;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Daily Revenues
//****************************************************************************
@InputType()
export class UpdatesamplerestDailyRevenueInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BusinessDate?: Date;

    @Field(() => Int, { nullable: true })
    TotalOrders?: number;

    @Field(() => Float, { nullable: true })
    TotalRevenue?: number;

    @Field(() => Float, { nullable: true })
    TotalTips?: number;

    @Field(() => Int, { nullable: true })
    CustomerCount?: number;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Daily Revenues
//****************************************************************************
@ObjectType()
export class RunsamplerestDailyRevenueViewResult {
    @Field(() => [samplerestDailyRevenue_])
    Results: samplerestDailyRevenue_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestDailyRevenue_)
export class samplerestDailyRevenueResolver extends ResolverBase {
    @Query(() => RunsamplerestDailyRevenueViewResult)
    async RunsamplerestDailyRevenueViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestDailyRevenueViewResult)
    async RunsamplerestDailyRevenueViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestDailyRevenueViewResult)
    async RunsamplerestDailyRevenueDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Daily Revenues';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestDailyRevenue_, { nullable: true })
    async samplerestDailyRevenue(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestDailyRevenue_ | null> {
        this.CheckUserReadPermissions('Daily Revenues', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwDailyRevenues] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Daily Revenues', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Daily Revenues', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplerestDailyRevenue_)
    async CreatesamplerestDailyRevenue(
        @Arg('input', () => CreatesamplerestDailyRevenueInput) input: CreatesamplerestDailyRevenueInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Daily Revenues', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestDailyRevenue_)
    async UpdatesamplerestDailyRevenue(
        @Arg('input', () => UpdatesamplerestDailyRevenueInput) input: UpdatesamplerestDailyRevenueInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Daily Revenues', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestDailyRevenue_)
    async DeletesamplerestDailyRevenue(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Daily Revenues', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Departments
//****************************************************************************
@ObjectType({ description: `Organizational departments for agent grouping` })
export class samplehdDepartment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(300)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    ManagerEmail?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplehdSupportAgent_])
    SupportAgents_DepartmentIDArray: samplehdSupportAgent_[]; // Link to SupportAgents
    
    @Field(() => [samplehdCategory_])
    Categories_DepartmentIDArray: samplehdCategory_[]; // Link to Categories
    
}

//****************************************************************************
// INPUT TYPE for Departments
//****************************************************************************
@InputType()
export class CreatesamplehdDepartmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ManagerEmail: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Departments
//****************************************************************************
@InputType()
export class UpdatesamplehdDepartmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ManagerEmail?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Departments
//****************************************************************************
@ObjectType()
export class RunsamplehdDepartmentViewResult {
    @Field(() => [samplehdDepartment_])
    Results: samplehdDepartment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdDepartment_)
export class samplehdDepartmentResolver extends ResolverBase {
    @Query(() => RunsamplehdDepartmentViewResult)
    async RunsamplehdDepartmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdDepartmentViewResult)
    async RunsamplehdDepartmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdDepartmentViewResult)
    async RunsamplehdDepartmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Departments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdDepartment_, { nullable: true })
    async samplehdDepartment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdDepartment_ | null> {
        this.CheckUserReadPermissions('Departments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwDepartments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Departments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Departments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplehdSupportAgent_])
    async SupportAgents_DepartmentIDArray(@Root() samplehddepartment_: samplehdDepartment_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Support Agents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwSupportAgents] WHERE [DepartmentID]='${samplehddepartment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Support Agents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Support Agents', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplehdCategory_])
    async Categories_DepartmentIDArray(@Root() samplehddepartment_: samplehdDepartment_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwCategories] WHERE [DepartmentID]='${samplehddepartment_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplehdDepartment_)
    async CreatesamplehdDepartment(
        @Arg('input', () => CreatesamplehdDepartmentInput) input: CreatesamplehdDepartmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Departments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdDepartment_)
    async UpdatesamplehdDepartment(
        @Arg('input', () => UpdatesamplehdDepartmentInput) input: UpdatesamplehdDepartmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Departments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdDepartment_)
    async DeletesamplehdDepartment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Departments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Donations
//****************************************************************************
@ObjectType({ description: `Financial contributions from donors` })
export class samplenpoDonation_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    DonorID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CampaignID?: string;
        
    @Field(() => Float, {description: `Donation amount in dollars`}) 
    Amount: number;
        
    @Field() 
    @MaxLength(8)
    DonationDate: Date;
        
    @Field() 
    @MaxLength(20)
    PaymentMethod: string;
        
    @Field(() => Boolean) 
    IsRecurring: boolean;
        
    @Field() 
    @MaxLength(30)
    ReceiptNumber: string;
        
    @Field(() => Boolean, {description: `Whether this is a tax-deductible contribution`}) 
    TaxDeductible: boolean;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Campaign?: string;
        
}

//****************************************************************************
// INPUT TYPE for Donations
//****************************************************************************
@InputType()
export class CreatesamplenpoDonationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DonorID?: string;

    @Field({ nullable: true })
    CampaignID: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    DonationDate?: Date;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field(() => Boolean, { nullable: true })
    IsRecurring?: boolean;

    @Field({ nullable: true })
    ReceiptNumber?: string;

    @Field(() => Boolean, { nullable: true })
    TaxDeductible?: boolean;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Donations
//****************************************************************************
@InputType()
export class UpdatesamplenpoDonationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DonorID?: string;

    @Field({ nullable: true })
    CampaignID?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    DonationDate?: Date;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field(() => Boolean, { nullable: true })
    IsRecurring?: boolean;

    @Field({ nullable: true })
    ReceiptNumber?: string;

    @Field(() => Boolean, { nullable: true })
    TaxDeductible?: boolean;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Donations
//****************************************************************************
@ObjectType()
export class RunsamplenpoDonationViewResult {
    @Field(() => [samplenpoDonation_])
    Results: samplenpoDonation_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoDonation_)
export class samplenpoDonationResolver extends ResolverBase {
    @Query(() => RunsamplenpoDonationViewResult)
    async RunsamplenpoDonationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoDonationViewResult)
    async RunsamplenpoDonationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoDonationViewResult)
    async RunsamplenpoDonationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Donations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoDonation_, { nullable: true })
    async samplenpoDonation(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoDonation_ | null> {
        this.CheckUserReadPermissions('Donations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwDonations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Donations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Donations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplenpoDonation_)
    async CreatesamplenpoDonation(
        @Arg('input', () => CreatesamplenpoDonationInput) input: CreatesamplenpoDonationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Donations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoDonation_)
    async UpdatesamplenpoDonation(
        @Arg('input', () => UpdatesamplenpoDonationInput) input: UpdatesamplenpoDonationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Donations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoDonation_)
    async DeletesamplenpoDonation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Donations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Donors
//****************************************************************************
@ObjectType({ description: `Individual, corporate, and foundation donors` })
export class samplenpoDonor_ {
    @Field({description: `Unique identifier for the donor`}) 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(600)
    Address?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    ZipCode?: string;
        
    @Field({description: `Type of donor: Individual, Corporate, or Foundation`}) 
    @MaxLength(20)
    DonorType: string;
        
    @Field(() => Boolean, {description: `Whether the donor prefers to remain anonymous`}) 
    IsAnonymous: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    FirstDonationDate?: Date;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(8)
    RegisteredAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplenpoDonation_])
    Donations_DonorIDArray: samplenpoDonation_[]; // Link to Donations
    
    @Field(() => [samplenpoEventAttendee_])
    EventAttendees_DonorIDArray: samplenpoEventAttendee_[]; // Link to EventAttendees
    
}

//****************************************************************************
// INPUT TYPE for Donors
//****************************************************************************
@InputType()
export class CreatesamplenpoDonorInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    ZipCode: string | null;

    @Field({ nullable: true })
    DonorType?: string;

    @Field(() => Boolean, { nullable: true })
    IsAnonymous?: boolean;

    @Field({ nullable: true })
    FirstDonationDate: Date | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    RegisteredAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Donors
//****************************************************************************
@InputType()
export class UpdatesamplenpoDonorInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    ZipCode?: string | null;

    @Field({ nullable: true })
    DonorType?: string;

    @Field(() => Boolean, { nullable: true })
    IsAnonymous?: boolean;

    @Field({ nullable: true })
    FirstDonationDate?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    RegisteredAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Donors
//****************************************************************************
@ObjectType()
export class RunsamplenpoDonorViewResult {
    @Field(() => [samplenpoDonor_])
    Results: samplenpoDonor_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoDonor_)
export class samplenpoDonorResolver extends ResolverBase {
    @Query(() => RunsamplenpoDonorViewResult)
    async RunsamplenpoDonorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoDonorViewResult)
    async RunsamplenpoDonorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoDonorViewResult)
    async RunsamplenpoDonorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Donors';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoDonor_, { nullable: true })
    async samplenpoDonor(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoDonor_ | null> {
        this.CheckUserReadPermissions('Donors', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwDonors] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Donors', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Donors', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplenpoDonation_])
    async Donations_DonorIDArray(@Root() samplenpodonor_: samplenpoDonor_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Donations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwDonations] WHERE [DonorID]='${samplenpodonor_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Donations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Donations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplenpoEventAttendee_])
    async EventAttendees_DonorIDArray(@Root() samplenpodonor_: samplenpoDonor_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Attendees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwEventAttendees] WHERE [DonorID]='${samplenpodonor_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Attendees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Attendees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplenpoDonor_)
    async CreatesamplenpoDonor(
        @Arg('input', () => CreatesamplenpoDonorInput) input: CreatesamplenpoDonorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Donors', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoDonor_)
    async UpdatesamplenpoDonor(
        @Arg('input', () => UpdatesamplenpoDonorInput) input: UpdatesamplenpoDonorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Donors', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoDonor_)
    async DeletesamplenpoDonor(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Donors', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Event Attendees
//****************************************************************************
@ObjectType({ description: `Links donors and volunteers to events` })
export class samplenpoEventAttendee_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    EventID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    DonorID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    VolunteerID?: string;
        
    @Field() 
    @MaxLength(20)
    AttendeeType: string;
        
    @Field(() => Boolean) 
    CheckedIn: boolean;
        
    @Field() 
    @MaxLength(8)
    RegisteredAt: Date;
        
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
// INPUT TYPE for Event Attendees
//****************************************************************************
@InputType()
export class CreatesamplenpoEventAttendeeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    DonorID: string | null;

    @Field({ nullable: true })
    VolunteerID: string | null;

    @Field({ nullable: true })
    AttendeeType?: string;

    @Field(() => Boolean, { nullable: true })
    CheckedIn?: boolean;

    @Field({ nullable: true })
    RegisteredAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Event Attendees
//****************************************************************************
@InputType()
export class UpdatesamplenpoEventAttendeeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EventID?: string;

    @Field({ nullable: true })
    DonorID?: string | null;

    @Field({ nullable: true })
    VolunteerID?: string | null;

    @Field({ nullable: true })
    AttendeeType?: string;

    @Field(() => Boolean, { nullable: true })
    CheckedIn?: boolean;

    @Field({ nullable: true })
    RegisteredAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Event Attendees
//****************************************************************************
@ObjectType()
export class RunsamplenpoEventAttendeeViewResult {
    @Field(() => [samplenpoEventAttendee_])
    Results: samplenpoEventAttendee_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoEventAttendee_)
export class samplenpoEventAttendeeResolver extends ResolverBase {
    @Query(() => RunsamplenpoEventAttendeeViewResult)
    async RunsamplenpoEventAttendeeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoEventAttendeeViewResult)
    async RunsamplenpoEventAttendeeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoEventAttendeeViewResult)
    async RunsamplenpoEventAttendeeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Event Attendees';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoEventAttendee_, { nullable: true })
    async samplenpoEventAttendee(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoEventAttendee_ | null> {
        this.CheckUserReadPermissions('Event Attendees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwEventAttendees] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Attendees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Event Attendees', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplenpoEventAttendee_)
    async CreatesamplenpoEventAttendee(
        @Arg('input', () => CreatesamplenpoEventAttendeeInput) input: CreatesamplenpoEventAttendeeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Event Attendees', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoEventAttendee_)
    async UpdatesamplenpoEventAttendee(
        @Arg('input', () => UpdatesamplenpoEventAttendeeInput) input: UpdatesamplenpoEventAttendeeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Event Attendees', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoEventAttendee_)
    async DeletesamplenpoEventAttendee(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Event Attendees', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType({ description: `Fundraising and community events` })
export class samplenpoEvent_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CampaignID?: string;
        
    @Field() 
    @MaxLength(3)
    EventDate: Date;
        
    @Field({description: `Event start time`}) 
    @MaxLength(5)
    StartTime: Date;
        
    @Field({description: `Event end time`}) 
    @MaxLength(5)
    EndTime: Date;
        
    @Field() 
    @MaxLength(600)
    Location: string;
        
    @Field(() => Int, {nullable: true}) 
    MaxAttendees?: number;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Campaign?: string;
        
    @Field(() => [samplenpoEventAttendee_])
    EventAttendees_EventIDArray: samplenpoEventAttendee_[]; // Link to EventAttendees
    
    @Field(() => [samplenpoVolunteerLog_])
    VolunteerLogs_EventIDArray: samplenpoVolunteerLog_[]; // Link to VolunteerLogs
    
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreatesamplenpoEventInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CampaignID: string | null;

    @Field({ nullable: true })
    EventDate?: Date;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Location?: string;

    @Field(() => Int, { nullable: true })
    MaxAttendees: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdatesamplenpoEventInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CampaignID?: string | null;

    @Field({ nullable: true })
    EventDate?: Date;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Location?: string;

    @Field(() => Int, { nullable: true })
    MaxAttendees?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunsamplenpoEventViewResult {
    @Field(() => [samplenpoEvent_])
    Results: samplenpoEvent_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoEvent_)
export class samplenpoEventResolver extends ResolverBase {
    @Query(() => RunsamplenpoEventViewResult)
    async RunsamplenpoEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoEventViewResult)
    async RunsamplenpoEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoEventViewResult)
    async RunsamplenpoEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoEvent_, { nullable: true })
    async samplenpoEvent(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoEvent_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwEvents] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplenpoEventAttendee_])
    async EventAttendees_EventIDArray(@Root() samplenpoevent_: samplenpoEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Attendees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwEventAttendees] WHERE [EventID]='${samplenpoevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Attendees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Attendees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplenpoVolunteerLog_])
    async VolunteerLogs_EventIDArray(@Root() samplenpoevent_: samplenpoEvent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Volunteer Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwVolunteerLogs] WHERE [EventID]='${samplenpoevent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Volunteer Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Volunteer Logs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplenpoEvent_)
    async CreatesamplenpoEvent(
        @Arg('input', () => CreatesamplenpoEventInput) input: CreatesamplenpoEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoEvent_)
    async UpdatesamplenpoEvent(
        @Arg('input', () => UpdatesamplenpoEventInput) input: UpdatesamplenpoEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoEvent_)
    async DeletesamplenpoEvent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Fines
//****************************************************************************
@ObjectType({ description: `Patron fines and fees` })
export class samplelibFine_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PatronID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CheckoutID?: string;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field() 
    @MaxLength(400)
    Reason: string;
        
    @Field() 
    @MaxLength(8)
    IssuedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    PaidAt?: Date;
        
    @Field(() => Boolean) 
    IsPaid: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Fines
//****************************************************************************
@InputType()
export class CreatesamplelibFineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PatronID?: string;

    @Field({ nullable: true })
    CheckoutID: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    Reason?: string;

    @Field({ nullable: true })
    IssuedAt?: Date;

    @Field({ nullable: true })
    PaidAt: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsPaid?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Fines
//****************************************************************************
@InputType()
export class UpdatesamplelibFineInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PatronID?: string;

    @Field({ nullable: true })
    CheckoutID?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    Reason?: string;

    @Field({ nullable: true })
    IssuedAt?: Date;

    @Field({ nullable: true })
    PaidAt?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsPaid?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Fines
//****************************************************************************
@ObjectType()
export class RunsamplelibFineViewResult {
    @Field(() => [samplelibFine_])
    Results: samplelibFine_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibFine_)
export class samplelibFineResolver extends ResolverBase {
    @Query(() => RunsamplelibFineViewResult)
    async RunsamplelibFineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibFineViewResult)
    async RunsamplelibFineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibFineViewResult)
    async RunsamplelibFineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Fines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibFine_, { nullable: true })
    async samplelibFine(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibFine_ | null> {
        this.CheckUserReadPermissions('Fines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwFines] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Fines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Fines', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplelibFine_)
    async CreatesamplelibFine(
        @Arg('input', () => CreatesamplelibFineInput) input: CreatesamplelibFineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Fines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibFine_)
    async UpdatesamplelibFine(
        @Arg('input', () => UpdatesamplelibFineInput) input: UpdatesamplelibFineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Fines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibFine_)
    async DeletesamplelibFine(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Fines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Fitness Classes
//****************************************************************************
@ObjectType({ description: `Scheduled group fitness classes` })
export class samplefitFitnessClass_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(16)
    TrainerID: string;
        
    @Field() 
    @MaxLength(16)
    LocationID: string;
        
    @Field({description: `Day of week: Monday through Sunday`}) 
    @MaxLength(10)
    DayOfWeek: string;
        
    @Field({description: `Class start time of day`}) 
    @MaxLength(5)
    StartTime: Date;
        
    @Field(() => Int) 
    DurationMinutes: number;
        
    @Field(() => Int) 
    MaxCapacity: number;
        
    @Field({description: `Class type: Yoga, HIIT, Spin, Pilates, CrossFit, Boxing, Swimming, Other`}) 
    @MaxLength(30)
    ClassType: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Location: string;
        
    @Field(() => [samplefitClassBooking_])
    ClassBookings_ClassIDArray: samplefitClassBooking_[]; // Link to ClassBookings
    
}

//****************************************************************************
// INPUT TYPE for Fitness Classes
//****************************************************************************
@InputType()
export class CreatesamplefitFitnessClassInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TrainerID?: string;

    @Field({ nullable: true })
    LocationID?: string;

    @Field({ nullable: true })
    DayOfWeek?: string;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number;

    @Field(() => Int, { nullable: true })
    MaxCapacity?: number;

    @Field({ nullable: true })
    ClassType?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Fitness Classes
//****************************************************************************
@InputType()
export class UpdatesamplefitFitnessClassInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TrainerID?: string;

    @Field({ nullable: true })
    LocationID?: string;

    @Field({ nullable: true })
    DayOfWeek?: string;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number;

    @Field(() => Int, { nullable: true })
    MaxCapacity?: number;

    @Field({ nullable: true })
    ClassType?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Fitness Classes
//****************************************************************************
@ObjectType()
export class RunsamplefitFitnessClassViewResult {
    @Field(() => [samplefitFitnessClass_])
    Results: samplefitFitnessClass_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitFitnessClass_)
export class samplefitFitnessClassResolver extends ResolverBase {
    @Query(() => RunsamplefitFitnessClassViewResult)
    async RunsamplefitFitnessClassViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitFitnessClassViewResult)
    async RunsamplefitFitnessClassViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitFitnessClassViewResult)
    async RunsamplefitFitnessClassDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Fitness Classes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitFitnessClass_, { nullable: true })
    async samplefitFitnessClass(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitFitnessClass_ | null> {
        this.CheckUserReadPermissions('Fitness Classes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwFitnessClasses] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Fitness Classes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Fitness Classes', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplefitClassBooking_])
    async ClassBookings_ClassIDArray(@Root() samplefitfitnessclass_: samplefitFitnessClass_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Class Bookings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwClassBookings] WHERE [ClassID]='${samplefitfitnessclass_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Class Bookings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Class Bookings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplefitFitnessClass_)
    async CreatesamplefitFitnessClass(
        @Arg('input', () => CreatesamplefitFitnessClassInput) input: CreatesamplefitFitnessClassInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Fitness Classes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitFitnessClass_)
    async UpdatesamplefitFitnessClass(
        @Arg('input', () => UpdatesamplefitFitnessClassInput) input: UpdatesamplefitFitnessClassInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Fitness Classes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitFitnessClass_)
    async DeletesamplefitFitnessClass(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Fitness Classes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Genres
//****************************************************************************
@ObjectType({ description: `Book genres/categories` })
export class samplelibGenre_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplelibBook_])
    Books_GenreIDArray: samplelibBook_[]; // Link to Books
    
}

//****************************************************************************
// INPUT TYPE for Genres
//****************************************************************************
@InputType()
export class CreatesamplelibGenreInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Genres
//****************************************************************************
@InputType()
export class UpdatesamplelibGenreInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Genres
//****************************************************************************
@ObjectType()
export class RunsamplelibGenreViewResult {
    @Field(() => [samplelibGenre_])
    Results: samplelibGenre_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibGenre_)
export class samplelibGenreResolver extends ResolverBase {
    @Query(() => RunsamplelibGenreViewResult)
    async RunsamplelibGenreViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibGenreViewResult)
    async RunsamplelibGenreViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibGenreViewResult)
    async RunsamplelibGenreDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Genres';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibGenre_, { nullable: true })
    async samplelibGenre(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibGenre_ | null> {
        this.CheckUserReadPermissions('Genres', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwGenres] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Genres', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Genres', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibBook_])
    async Books_GenreIDArray(@Root() samplelibgenre_: samplelibGenre_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Books', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwBooks] WHERE [GenreID]='${samplelibgenre_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Books', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Books', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibGenre_)
    async CreatesamplelibGenre(
        @Arg('input', () => CreatesamplelibGenreInput) input: CreatesamplelibGenreInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Genres', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibGenre_)
    async UpdatesamplelibGenre(
        @Arg('input', () => UpdatesamplelibGenreInput) input: UpdatesamplelibGenreInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Genres', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibGenre_)
    async DeletesamplelibGenre(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Genres', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Grant _s
//****************************************************************************
@ObjectType({ description: `Grants applied for and received from external organizations` })
export class samplenpoGrant_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    GrantorName: string;
        
    @Field() 
    @MaxLength(600)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Float, {description: `Grant amount in dollars`}) 
    Amount: number;
        
    @Field() 
    @MaxLength(3)
    ApplicationDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    AwardDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    ExpirationDate?: Date;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    RequirementsNotes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CampaignID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Campaign?: string;
        
}

//****************************************************************************
// INPUT TYPE for Grant _s
//****************************************************************************
@InputType()
export class CreatesamplenpoGrantInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    GrantorName?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    ApplicationDate?: Date;

    @Field({ nullable: true })
    AwardDate: Date | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    RequirementsNotes: string | null;

    @Field({ nullable: true })
    CampaignID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Grant _s
//****************************************************************************
@InputType()
export class UpdatesamplenpoGrantInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    GrantorName?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    ApplicationDate?: Date;

    @Field({ nullable: true })
    AwardDate?: Date | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    RequirementsNotes?: string | null;

    @Field({ nullable: true })
    CampaignID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Grant _s
//****************************************************************************
@ObjectType()
export class RunsamplenpoGrantViewResult {
    @Field(() => [samplenpoGrant_])
    Results: samplenpoGrant_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoGrant_)
export class samplenpoGrantResolver extends ResolverBase {
    @Query(() => RunsamplenpoGrantViewResult)
    async RunsamplenpoGrantViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoGrantViewResult)
    async RunsamplenpoGrantViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoGrantViewResult)
    async RunsamplenpoGrantDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Grant _s';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoGrant_, { nullable: true })
    async samplenpoGrant(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoGrant_ | null> {
        this.CheckUserReadPermissions('Grant _s', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwGrant_s] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Grant _s', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Grant _s', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplenpoGrant_)
    async CreatesamplenpoGrant(
        @Arg('input', () => CreatesamplenpoGrantInput) input: CreatesamplenpoGrantInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Grant _s', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoGrant_)
    async UpdatesamplenpoGrant(
        @Arg('input', () => UpdatesamplenpoGrantInput) input: UpdatesamplenpoGrantInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Grant _s', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoGrant_)
    async DeletesamplenpoGrant(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Grant _s', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Inspections
//****************************************************************************
@ObjectType({ description: `Property inspections` })
export class samplepropertyInspection_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(3)
    InspectionDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(5)
    InspectionTime?: Date;
        
    @Field() 
    @MaxLength(200)
    InspectorName: string;
        
    @Field(() => Int) 
    OverallRating: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field(() => Boolean) 
    FollowUpRequired: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Property: string;
        
}

//****************************************************************************
// INPUT TYPE for Inspections
//****************************************************************************
@InputType()
export class CreatesamplepropertyInspectionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    InspectionDate?: Date;

    @Field({ nullable: true })
    InspectionTime: Date | null;

    @Field({ nullable: true })
    InspectorName?: string;

    @Field(() => Int, { nullable: true })
    OverallRating?: number;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => Boolean, { nullable: true })
    FollowUpRequired?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Inspections
//****************************************************************************
@InputType()
export class UpdatesamplepropertyInspectionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    InspectionDate?: Date;

    @Field({ nullable: true })
    InspectionTime?: Date | null;

    @Field({ nullable: true })
    InspectorName?: string;

    @Field(() => Int, { nullable: true })
    OverallRating?: number;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => Boolean, { nullable: true })
    FollowUpRequired?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Inspections
//****************************************************************************
@ObjectType()
export class RunsamplepropertyInspectionViewResult {
    @Field(() => [samplepropertyInspection_])
    Results: samplepropertyInspection_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyInspection_)
export class samplepropertyInspectionResolver extends ResolverBase {
    @Query(() => RunsamplepropertyInspectionViewResult)
    async RunsamplepropertyInspectionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyInspectionViewResult)
    async RunsamplepropertyInspectionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyInspectionViewResult)
    async RunsamplepropertyInspectionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Inspections';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyInspection_, { nullable: true })
    async samplepropertyInspection(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyInspection_ | null> {
        this.CheckUserReadPermissions('Inspections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwInspections] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Inspections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Inspections', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplepropertyInspection_)
    async CreatesamplepropertyInspection(
        @Arg('input', () => CreatesamplepropertyInspectionInput) input: CreatesamplepropertyInspectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Inspections', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyInspection_)
    async UpdatesamplepropertyInspection(
        @Arg('input', () => UpdatesamplepropertyInspectionInput) input: UpdatesamplepropertyInspectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Inspections', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyInspection_)
    async DeletesamplepropertyInspection(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Inspections', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Knowledge Articles
//****************************************************************************
@ObjectType({ description: `Self-service knowledge base articles` })
export class samplehdKnowledgeArticle_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(600)
    Title: string;
        
    @Field({description: `URL-friendly unique identifier for the article`}) 
    @MaxLength(300)
    Slug: string;
        
    @Field() 
    Body: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    CategoryID?: string;
        
    @Field() 
    @MaxLength(16)
    AuthorAgentID: string;
        
    @Field(() => Boolean) 
    IsPublished: boolean;
        
    @Field(() => Int) 
    ViewCount: number;
        
    @Field(() => Int) 
    HelpfulCount: number;
        
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
        
    @Field({nullable: true}) 
    @MaxLength(300)
    Category?: string;
        
}

//****************************************************************************
// INPUT TYPE for Knowledge Articles
//****************************************************************************
@InputType()
export class CreatesamplehdKnowledgeArticleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Slug?: string;

    @Field({ nullable: true })
    Body?: string;

    @Field({ nullable: true })
    CategoryID: string | null;

    @Field({ nullable: true })
    AuthorAgentID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPublished?: boolean;

    @Field(() => Int, { nullable: true })
    ViewCount?: number;

    @Field(() => Int, { nullable: true })
    HelpfulCount?: number;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Knowledge Articles
//****************************************************************************
@InputType()
export class UpdatesamplehdKnowledgeArticleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Slug?: string;

    @Field({ nullable: true })
    Body?: string;

    @Field({ nullable: true })
    CategoryID?: string | null;

    @Field({ nullable: true })
    AuthorAgentID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPublished?: boolean;

    @Field(() => Int, { nullable: true })
    ViewCount?: number;

    @Field(() => Int, { nullable: true })
    HelpfulCount?: number;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Knowledge Articles
//****************************************************************************
@ObjectType()
export class RunsamplehdKnowledgeArticleViewResult {
    @Field(() => [samplehdKnowledgeArticle_])
    Results: samplehdKnowledgeArticle_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdKnowledgeArticle_)
export class samplehdKnowledgeArticleResolver extends ResolverBase {
    @Query(() => RunsamplehdKnowledgeArticleViewResult)
    async RunsamplehdKnowledgeArticleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdKnowledgeArticleViewResult)
    async RunsamplehdKnowledgeArticleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdKnowledgeArticleViewResult)
    async RunsamplehdKnowledgeArticleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Knowledge Articles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdKnowledgeArticle_, { nullable: true })
    async samplehdKnowledgeArticle(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdKnowledgeArticle_ | null> {
        this.CheckUserReadPermissions('Knowledge Articles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwKnowledgeArticles] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Knowledge Articles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Knowledge Articles', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplehdKnowledgeArticle_)
    async CreatesamplehdKnowledgeArticle(
        @Arg('input', () => CreatesamplehdKnowledgeArticleInput) input: CreatesamplehdKnowledgeArticleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Knowledge Articles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdKnowledgeArticle_)
    async UpdatesamplehdKnowledgeArticle(
        @Arg('input', () => UpdatesamplehdKnowledgeArticleInput) input: UpdatesamplehdKnowledgeArticleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Knowledge Articles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdKnowledgeArticle_)
    async DeletesamplehdKnowledgeArticle(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Knowledge Articles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Leases
//****************************************************************************
@ObjectType({ description: `Lease agreements` })
export class samplepropertyLease_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(16)
    TenantID: string;
        
    @Field() 
    @MaxLength(3)
    StartDate: Date;
        
    @Field() 
    @MaxLength(3)
    EndDate: Date;
        
    @Field(() => Float) 
    MonthlyRent: number;
        
    @Field(() => Float) 
    SecurityDeposit: number;
        
    @Field() 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Property: string;
        
    @Field(() => [samplepropertyPayment_])
    Payments__sample_property_LeaseIDArray: samplepropertyPayment_[]; // Link to Payments__sample_property
    
}

//****************************************************************************
// INPUT TYPE for Leases
//****************************************************************************
@InputType()
export class CreatesamplepropertyLeaseInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    TenantID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field(() => Float, { nullable: true })
    MonthlyRent?: number;

    @Field(() => Float, { nullable: true })
    SecurityDeposit?: number;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Leases
//****************************************************************************
@InputType()
export class UpdatesamplepropertyLeaseInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    TenantID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field(() => Float, { nullable: true })
    MonthlyRent?: number;

    @Field(() => Float, { nullable: true })
    SecurityDeposit?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Leases
//****************************************************************************
@ObjectType()
export class RunsamplepropertyLeaseViewResult {
    @Field(() => [samplepropertyLease_])
    Results: samplepropertyLease_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyLease_)
export class samplepropertyLeaseResolver extends ResolverBase {
    @Query(() => RunsamplepropertyLeaseViewResult)
    async RunsamplepropertyLeaseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyLeaseViewResult)
    async RunsamplepropertyLeaseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyLeaseViewResult)
    async RunsamplepropertyLeaseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Leases';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyLease_, { nullable: true })
    async samplepropertyLease(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyLease_ | null> {
        this.CheckUserReadPermissions('Leases', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwLeases] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Leases', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Leases', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplepropertyPayment_])
    async Payments__sample_property_LeaseIDArray(@Root() samplepropertylease_: samplepropertyLease_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Payments__sample_property', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwPayments__sample_property] WHERE [LeaseID]='${samplepropertylease_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments__sample_property', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Payments__sample_property', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplepropertyLease_)
    async CreatesamplepropertyLease(
        @Arg('input', () => CreatesamplepropertyLeaseInput) input: CreatesamplepropertyLeaseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Leases', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyLease_)
    async UpdatesamplepropertyLease(
        @Arg('input', () => UpdatesamplepropertyLeaseInput) input: UpdatesamplepropertyLeaseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Leases', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyLease_)
    async DeletesamplepropertyLease(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Leases', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Locations
//****************************************************************************
@ObjectType({ description: `Gym and fitness center locations` })
export class samplefitLocation_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field() 
    @MaxLength(600)
    Address: string;
        
    @Field() 
    @MaxLength(200)
    City: string;
        
    @Field() 
    @MaxLength(2)
    State: string;
        
    @Field() 
    @MaxLength(10)
    ZipCode: string;
        
    @Field() 
    @MaxLength(20)
    Phone: string;
        
    @Field({description: `Facility daily opening time`}) 
    @MaxLength(5)
    OpenTime: Date;
        
    @Field({description: `Facility daily closing time`}) 
    @MaxLength(5)
    CloseTime: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplefitTrainer_])
    Trainers_LocationIDArray: samplefitTrainer_[]; // Link to Trainers
    
    @Field(() => [samplefitFitnessClass_])
    FitnessClasses_LocationIDArray: samplefitFitnessClass_[]; // Link to FitnessClasses
    
    @Field(() => [samplefitMember_])
    Members_LocationIDArray: samplefitMember_[]; // Link to Members
    
}

//****************************************************************************
// INPUT TYPE for Locations
//****************************************************************************
@InputType()
export class CreatesamplefitLocationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    OpenTime?: Date;

    @Field({ nullable: true })
    CloseTime?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Locations
//****************************************************************************
@InputType()
export class UpdatesamplefitLocationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    OpenTime?: Date;

    @Field({ nullable: true })
    CloseTime?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Locations
//****************************************************************************
@ObjectType()
export class RunsamplefitLocationViewResult {
    @Field(() => [samplefitLocation_])
    Results: samplefitLocation_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitLocation_)
export class samplefitLocationResolver extends ResolverBase {
    @Query(() => RunsamplefitLocationViewResult)
    async RunsamplefitLocationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitLocationViewResult)
    async RunsamplefitLocationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitLocationViewResult)
    async RunsamplefitLocationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Locations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitLocation_, { nullable: true })
    async samplefitLocation(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitLocation_ | null> {
        this.CheckUserReadPermissions('Locations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwLocations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Locations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Locations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplefitTrainer_])
    async Trainers_LocationIDArray(@Root() samplefitlocation_: samplefitLocation_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Trainers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwTrainers] WHERE [LocationID]='${samplefitlocation_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Trainers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Trainers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplefitFitnessClass_])
    async FitnessClasses_LocationIDArray(@Root() samplefitlocation_: samplefitLocation_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Fitness Classes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwFitnessClasses] WHERE [LocationID]='${samplefitlocation_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Fitness Classes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Fitness Classes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplefitMember_])
    async Members_LocationIDArray(@Root() samplefitlocation_: samplefitLocation_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwMembers] WHERE [LocationID]='${samplefitlocation_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplefitLocation_)
    async CreatesamplefitLocation(
        @Arg('input', () => CreatesamplefitLocationInput) input: CreatesamplefitLocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Locations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitLocation_)
    async UpdatesamplefitLocation(
        @Arg('input', () => UpdatesamplefitLocationInput) input: UpdatesamplefitLocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Locations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitLocation_)
    async DeletesamplefitLocation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Locations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Maintenance Requests
//****************************************************************************
@ObjectType({ description: `Maintenance work requests` })
export class samplepropertyMaintenanceRequest_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    TenantID?: string;
        
    @Field() 
    @MaxLength(400)
    Title: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(20)
    Priority: string;
        
    @Field() 
    @MaxLength(40)
    Status: string;
        
    @Field() 
    @MaxLength(8)
    RequestDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    CompletedDate?: Date;
        
    @Field(() => Float, {nullable: true}) 
    EstimatedCost?: number;
        
    @Field(() => Float, {nullable: true}) 
    ActualCost?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Property: string;
        
}

//****************************************************************************
// INPUT TYPE for Maintenance Requests
//****************************************************************************
@InputType()
export class CreatesamplepropertyMaintenanceRequestInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    TenantID: string | null;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Priority?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    RequestDate?: Date;

    @Field({ nullable: true })
    CompletedDate: Date | null;

    @Field(() => Float, { nullable: true })
    EstimatedCost: number | null;

    @Field(() => Float, { nullable: true })
    ActualCost: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Maintenance Requests
//****************************************************************************
@InputType()
export class UpdatesamplepropertyMaintenanceRequestInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    TenantID?: string | null;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Priority?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    RequestDate?: Date;

    @Field({ nullable: true })
    CompletedDate?: Date | null;

    @Field(() => Float, { nullable: true })
    EstimatedCost?: number | null;

    @Field(() => Float, { nullable: true })
    ActualCost?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Maintenance Requests
//****************************************************************************
@ObjectType()
export class RunsamplepropertyMaintenanceRequestViewResult {
    @Field(() => [samplepropertyMaintenanceRequest_])
    Results: samplepropertyMaintenanceRequest_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyMaintenanceRequest_)
export class samplepropertyMaintenanceRequestResolver extends ResolverBase {
    @Query(() => RunsamplepropertyMaintenanceRequestViewResult)
    async RunsamplepropertyMaintenanceRequestViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyMaintenanceRequestViewResult)
    async RunsamplepropertyMaintenanceRequestViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyMaintenanceRequestViewResult)
    async RunsamplepropertyMaintenanceRequestDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Maintenance Requests';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyMaintenanceRequest_, { nullable: true })
    async samplepropertyMaintenanceRequest(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyMaintenanceRequest_ | null> {
        this.CheckUserReadPermissions('Maintenance Requests', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwMaintenanceRequests] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Maintenance Requests', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Maintenance Requests', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplepropertyMaintenanceRequest_)
    async CreatesamplepropertyMaintenanceRequest(
        @Arg('input', () => CreatesamplepropertyMaintenanceRequestInput) input: CreatesamplepropertyMaintenanceRequestInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Maintenance Requests', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyMaintenanceRequest_)
    async UpdatesamplepropertyMaintenanceRequest(
        @Arg('input', () => UpdatesamplepropertyMaintenanceRequestInput) input: UpdatesamplepropertyMaintenanceRequestInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Maintenance Requests', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyMaintenanceRequest_)
    async DeletesamplepropertyMaintenanceRequest(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Maintenance Requests', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Member Measurements
//****************************************************************************
@ObjectType({ description: `Body measurement tracking for members` })
export class samplefitMemberMeasurement_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(3)
    MeasurementDate: Date;
        
    @Field(() => Float, {description: `Member weight in pounds`}) 
    WeightLbs: number;
        
    @Field(() => Float, {nullable: true, description: `Body fat percentage`}) 
    BodyFatPercent?: number;
        
    @Field(() => Float, {nullable: true}) 
    BMI?: number;
        
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
// INPUT TYPE for Member Measurements
//****************************************************************************
@InputType()
export class CreatesamplefitMemberMeasurementInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    MeasurementDate?: Date;

    @Field(() => Float, { nullable: true })
    WeightLbs?: number;

    @Field(() => Float, { nullable: true })
    BodyFatPercent: number | null;

    @Field(() => Float, { nullable: true })
    BMI: number | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Member Measurements
//****************************************************************************
@InputType()
export class UpdatesamplefitMemberMeasurementInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    MeasurementDate?: Date;

    @Field(() => Float, { nullable: true })
    WeightLbs?: number;

    @Field(() => Float, { nullable: true })
    BodyFatPercent?: number | null;

    @Field(() => Float, { nullable: true })
    BMI?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Member Measurements
//****************************************************************************
@ObjectType()
export class RunsamplefitMemberMeasurementViewResult {
    @Field(() => [samplefitMemberMeasurement_])
    Results: samplefitMemberMeasurement_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitMemberMeasurement_)
export class samplefitMemberMeasurementResolver extends ResolverBase {
    @Query(() => RunsamplefitMemberMeasurementViewResult)
    async RunsamplefitMemberMeasurementViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitMemberMeasurementViewResult)
    async RunsamplefitMemberMeasurementViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitMemberMeasurementViewResult)
    async RunsamplefitMemberMeasurementDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Member Measurements';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitMemberMeasurement_, { nullable: true })
    async samplefitMemberMeasurement(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitMemberMeasurement_ | null> {
        this.CheckUserReadPermissions('Member Measurements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwMemberMeasurements] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Measurements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Member Measurements', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplefitMemberMeasurement_)
    async CreatesamplefitMemberMeasurement(
        @Arg('input', () => CreatesamplefitMemberMeasurementInput) input: CreatesamplefitMemberMeasurementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Member Measurements', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitMemberMeasurement_)
    async UpdatesamplefitMemberMeasurement(
        @Arg('input', () => UpdatesamplefitMemberMeasurementInput) input: UpdatesamplefitMemberMeasurementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Member Measurements', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitMemberMeasurement_)
    async DeletesamplefitMemberMeasurement(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Member Measurements', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Members
//****************************************************************************
@ObjectType({ description: `Gym members with membership tier and home location` })
export class samplefitMember_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field() 
    @MaxLength(3)
    DateOfBirth: Date;
        
    @Field({description: `Emergency contact name and phone number`}) 
    @MaxLength(400)
    EmergencyContact: string;
        
    @Field() 
    @MaxLength(16)
    MembershipTierID: string;
        
    @Field() 
    @MaxLength(16)
    LocationID: string;
        
    @Field() 
    @MaxLength(8)
    JoinDate: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    MembershipTier: string;
        
    @Field() 
    @MaxLength(400)
    Location: string;
        
    @Field(() => [samplefitMemberMeasurement_])
    MemberMeasurements_MemberIDArray: samplefitMemberMeasurement_[]; // Link to MemberMeasurements
    
    @Field(() => [samplefitPersonalTrainingSession_])
    PersonalTrainingSessions_MemberIDArray: samplefitPersonalTrainingSession_[]; // Link to PersonalTrainingSessions
    
    @Field(() => [samplefitPayment_])
    Payments_MemberIDArray: samplefitPayment_[]; // Link to Payments
    
    @Field(() => [samplefitClassBooking_])
    ClassBookings_MemberIDArray: samplefitClassBooking_[]; // Link to ClassBookings
    
}

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class CreatesamplefitMemberInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    DateOfBirth?: Date;

    @Field({ nullable: true })
    EmergencyContact?: string;

    @Field({ nullable: true })
    MembershipTierID?: string;

    @Field({ nullable: true })
    LocationID?: string;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class UpdatesamplefitMemberInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    DateOfBirth?: Date;

    @Field({ nullable: true })
    EmergencyContact?: string;

    @Field({ nullable: true })
    MembershipTierID?: string;

    @Field({ nullable: true })
    LocationID?: string;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Members
//****************************************************************************
@ObjectType()
export class RunsamplefitMemberViewResult {
    @Field(() => [samplefitMember_])
    Results: samplefitMember_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitMember_)
export class samplefitMemberResolver extends ResolverBase {
    @Query(() => RunsamplefitMemberViewResult)
    async RunsamplefitMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitMemberViewResult)
    async RunsamplefitMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitMemberViewResult)
    async RunsamplefitMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitMember_, { nullable: true })
    async samplefitMember(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitMember_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwMembers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Members', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplefitMemberMeasurement_])
    async MemberMeasurements_MemberIDArray(@Root() samplefitmember_: samplefitMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Member Measurements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwMemberMeasurements] WHERE [MemberID]='${samplefitmember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Member Measurements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Member Measurements', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplefitPersonalTrainingSession_])
    async PersonalTrainingSessions_MemberIDArray(@Root() samplefitmember_: samplefitMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Personal Training Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwPersonalTrainingSessions] WHERE [MemberID]='${samplefitmember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Personal Training Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Personal Training Sessions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplefitPayment_])
    async Payments_MemberIDArray(@Root() samplefitmember_: samplefitMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwPayments] WHERE [MemberID]='${samplefitmember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplefitClassBooking_])
    async ClassBookings_MemberIDArray(@Root() samplefitmember_: samplefitMember_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Class Bookings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwClassBookings] WHERE [MemberID]='${samplefitmember_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Class Bookings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Class Bookings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplefitMember_)
    async CreatesamplefitMember(
        @Arg('input', () => CreatesamplefitMemberInput) input: CreatesamplefitMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitMember_)
    async UpdatesamplefitMember(
        @Arg('input', () => UpdatesamplefitMemberInput) input: UpdatesamplefitMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitMember_)
    async DeletesamplefitMember(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Members', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Membership Tiers
//****************************************************************************
@ObjectType({ description: `Membership tier definitions with pricing and amenity access` })
export class samplefitMembershipTier_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field(() => Float, {description: `Monthly membership fee in dollars`}) 
    MonthlyFee: number;
        
    @Field(() => Float, {nullable: true, description: `Optional annual fee (discount vs monthly)`}) 
    AnnualFee?: number;
        
    @Field(() => Int, {nullable: true, description: `Maximum group classes allowed per week for this tier`}) 
    MaxClassesPerWeek?: number;
        
    @Field(() => Boolean) 
    HasPoolAccess: boolean;
        
    @Field(() => Boolean) 
    HasSaunaAccess: boolean;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplefitMember_])
    Members_MembershipTierIDArray: samplefitMember_[]; // Link to Members
    
}

//****************************************************************************
// INPUT TYPE for Membership Tiers
//****************************************************************************
@InputType()
export class CreatesamplefitMembershipTierInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Float, { nullable: true })
    MonthlyFee?: number;

    @Field(() => Float, { nullable: true })
    AnnualFee: number | null;

    @Field(() => Int, { nullable: true })
    MaxClassesPerWeek: number | null;

    @Field(() => Boolean, { nullable: true })
    HasPoolAccess?: boolean;

    @Field(() => Boolean, { nullable: true })
    HasSaunaAccess?: boolean;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Membership Tiers
//****************************************************************************
@InputType()
export class UpdatesamplefitMembershipTierInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Float, { nullable: true })
    MonthlyFee?: number;

    @Field(() => Float, { nullable: true })
    AnnualFee?: number | null;

    @Field(() => Int, { nullable: true })
    MaxClassesPerWeek?: number | null;

    @Field(() => Boolean, { nullable: true })
    HasPoolAccess?: boolean;

    @Field(() => Boolean, { nullable: true })
    HasSaunaAccess?: boolean;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Membership Tiers
//****************************************************************************
@ObjectType()
export class RunsamplefitMembershipTierViewResult {
    @Field(() => [samplefitMembershipTier_])
    Results: samplefitMembershipTier_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitMembershipTier_)
export class samplefitMembershipTierResolver extends ResolverBase {
    @Query(() => RunsamplefitMembershipTierViewResult)
    async RunsamplefitMembershipTierViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitMembershipTierViewResult)
    async RunsamplefitMembershipTierViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitMembershipTierViewResult)
    async RunsamplefitMembershipTierDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Membership Tiers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitMembershipTier_, { nullable: true })
    async samplefitMembershipTier(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitMembershipTier_ | null> {
        this.CheckUserReadPermissions('Membership Tiers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwMembershipTiers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Membership Tiers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Membership Tiers', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplefitMember_])
    async Members_MembershipTierIDArray(@Root() samplefitmembershiptier_: samplefitMembershipTier_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwMembers] WHERE [MembershipTierID]='${samplefitmembershiptier_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Members', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplefitMembershipTier_)
    async CreatesamplefitMembershipTier(
        @Arg('input', () => CreatesamplefitMembershipTierInput) input: CreatesamplefitMembershipTierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Membership Tiers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitMembershipTier_)
    async UpdatesamplefitMembershipTier(
        @Arg('input', () => UpdatesamplefitMembershipTierInput) input: UpdatesamplefitMembershipTierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Membership Tiers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitMembershipTier_)
    async DeletesamplefitMembershipTier(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Membership Tiers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Menu Categories
//****************************************************************************
@ObjectType({ description: `Categories for organizing the restaurant menu` })
export class samplerestMenuCategory_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field(() => Int) 
    SortOrder: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplerestMenuItem_])
    MenuItems_CategoryIDArray: samplerestMenuItem_[]; // Link to MenuItems
    
}

//****************************************************************************
// INPUT TYPE for Menu Categories
//****************************************************************************
@InputType()
export class CreatesamplerestMenuCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    Description: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Menu Categories
//****************************************************************************
@InputType()
export class UpdatesamplerestMenuCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Menu Categories
//****************************************************************************
@ObjectType()
export class RunsamplerestMenuCategoryViewResult {
    @Field(() => [samplerestMenuCategory_])
    Results: samplerestMenuCategory_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestMenuCategory_)
export class samplerestMenuCategoryResolver extends ResolverBase {
    @Query(() => RunsamplerestMenuCategoryViewResult)
    async RunsamplerestMenuCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestMenuCategoryViewResult)
    async RunsamplerestMenuCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestMenuCategoryViewResult)
    async RunsamplerestMenuCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Menu Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestMenuCategory_, { nullable: true })
    async samplerestMenuCategory(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestMenuCategory_ | null> {
        this.CheckUserReadPermissions('Menu Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwMenuCategories] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Menu Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Menu Categories', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplerestMenuItem_])
    async MenuItems_CategoryIDArray(@Root() samplerestmenucategory_: samplerestMenuCategory_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Menu Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwMenuItems] WHERE [CategoryID]='${samplerestmenucategory_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Menu Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Menu Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplerestMenuCategory_)
    async CreatesamplerestMenuCategory(
        @Arg('input', () => CreatesamplerestMenuCategoryInput) input: CreatesamplerestMenuCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Menu Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestMenuCategory_)
    async UpdatesamplerestMenuCategory(
        @Arg('input', () => UpdatesamplerestMenuCategoryInput) input: UpdatesamplerestMenuCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Menu Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestMenuCategory_)
    async DeletesamplerestMenuCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Menu Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Menu Items
//****************************************************************************
@ObjectType({ description: `Individual dishes and beverages on the menu` })
export class samplerestMenuItem_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(16)
    CategoryID: string;
        
    @Field(() => Float, {description: `Menu item sale price`}) 
    Price: number;
        
    @Field(() => Int, {nullable: true}) 
    CalorieCount?: number;
        
    @Field(() => Boolean) 
    IsVegetarian: boolean;
        
    @Field(() => Boolean, {description: `Whether the item contains no gluten ingredients`}) 
    IsGlutenFree: boolean;
        
    @Field(() => Boolean) 
    IsAvailable: boolean;
        
    @Field(() => Int, {description: `Estimated preparation time in minutes`}) 
    PrepTimeMinutes: number;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    ImageURL?: string;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Category: string;
        
    @Field(() => [samplerestOrderItem_])
    OrderItems_MenuItemIDArray: samplerestOrderItem_[]; // Link to OrderItems
    
}

//****************************************************************************
// INPUT TYPE for Menu Items
//****************************************************************************
@InputType()
export class CreatesamplerestMenuItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field(() => Int, { nullable: true })
    CalorieCount: number | null;

    @Field(() => Boolean, { nullable: true })
    IsVegetarian?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsGlutenFree?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field(() => Int, { nullable: true })
    PrepTimeMinutes?: number;

    @Field({ nullable: true })
    ImageURL: string | null;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Menu Items
//****************************************************************************
@InputType()
export class UpdatesamplerestMenuItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field(() => Int, { nullable: true })
    CalorieCount?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsVegetarian?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsGlutenFree?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field(() => Int, { nullable: true })
    PrepTimeMinutes?: number;

    @Field({ nullable: true })
    ImageURL?: string | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Menu Items
//****************************************************************************
@ObjectType()
export class RunsamplerestMenuItemViewResult {
    @Field(() => [samplerestMenuItem_])
    Results: samplerestMenuItem_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestMenuItem_)
export class samplerestMenuItemResolver extends ResolverBase {
    @Query(() => RunsamplerestMenuItemViewResult)
    async RunsamplerestMenuItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestMenuItemViewResult)
    async RunsamplerestMenuItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestMenuItemViewResult)
    async RunsamplerestMenuItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Menu Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestMenuItem_, { nullable: true })
    async samplerestMenuItem(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestMenuItem_ | null> {
        this.CheckUserReadPermissions('Menu Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwMenuItems] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Menu Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Menu Items', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplerestOrderItem_])
    async OrderItems_MenuItemIDArray(@Root() samplerestmenuitem_: samplerestMenuItem_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Order Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwOrderItems] WHERE [MenuItemID]='${samplerestmenuitem_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Order Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Order Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplerestMenuItem_)
    async CreatesamplerestMenuItem(
        @Arg('input', () => CreatesamplerestMenuItemInput) input: CreatesamplerestMenuItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Menu Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestMenuItem_)
    async UpdatesamplerestMenuItem(
        @Arg('input', () => UpdatesamplerestMenuItemInput) input: UpdatesamplerestMenuItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Menu Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestMenuItem_)
    async DeletesamplerestMenuItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Menu Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Offers
//****************************************************************************
@ObjectType({ description: `Purchase offers on properties` })
export class samplereOffer_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(16)
    ClientID: string;
        
    @Field(() => Float, {description: `Amount offered by the buyer`}) 
    OfferAmount: number;
        
    @Field() 
    @MaxLength(8)
    OfferDate: Date;
        
    @Field() 
    @MaxLength(8)
    ExpirationDate: Date;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field(() => Float, {nullable: true}) 
    CounterOfferAmount?: number;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field(() => Boolean) 
    IsAccepted: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Offers
//****************************************************************************
@InputType()
export class CreatesamplereOfferInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    ClientID?: string;

    @Field(() => Float, { nullable: true })
    OfferAmount?: number;

    @Field({ nullable: true })
    OfferDate?: Date;

    @Field({ nullable: true })
    ExpirationDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    CounterOfferAmount: number | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAccepted?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Offers
//****************************************************************************
@InputType()
export class UpdatesamplereOfferInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    ClientID?: string;

    @Field(() => Float, { nullable: true })
    OfferAmount?: number;

    @Field({ nullable: true })
    OfferDate?: Date;

    @Field({ nullable: true })
    ExpirationDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    CounterOfferAmount?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsAccepted?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Offers
//****************************************************************************
@ObjectType()
export class RunsamplereOfferViewResult {
    @Field(() => [samplereOffer_])
    Results: samplereOffer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereOffer_)
export class samplereOfferResolver extends ResolverBase {
    @Query(() => RunsamplereOfferViewResult)
    async RunsamplereOfferViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereOfferViewResult)
    async RunsamplereOfferViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereOfferViewResult)
    async RunsamplereOfferDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Offers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereOffer_, { nullable: true })
    async samplereOffer(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereOffer_ | null> {
        this.CheckUserReadPermissions('Offers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwOffers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Offers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Offers', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplereOffer_)
    async CreatesamplereOffer(
        @Arg('input', () => CreatesamplereOfferInput) input: CreatesamplereOfferInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Offers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereOffer_)
    async UpdatesamplereOffer(
        @Arg('input', () => UpdatesamplereOfferInput) input: UpdatesamplereOfferInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Offers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereOffer_)
    async DeletesamplereOffer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Offers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Open Houses
//****************************************************************************
@ObjectType({ description: `Scheduled open house events` })
export class samplereOpenHouse_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(16)
    AgentID: string;
        
    @Field() 
    @MaxLength(8)
    StartTime: Date;
        
    @Field() 
    @MaxLength(8)
    EndTime: Date;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum allowed attendees for the open house`}) 
    MaxAttendees?: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Open Houses
//****************************************************************************
@InputType()
export class CreatesamplereOpenHouseInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    MaxAttendees: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Open Houses
//****************************************************************************
@InputType()
export class UpdatesamplereOpenHouseInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    MaxAttendees?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Open Houses
//****************************************************************************
@ObjectType()
export class RunsamplereOpenHouseViewResult {
    @Field(() => [samplereOpenHouse_])
    Results: samplereOpenHouse_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereOpenHouse_)
export class samplereOpenHouseResolver extends ResolverBase {
    @Query(() => RunsamplereOpenHouseViewResult)
    async RunsamplereOpenHouseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereOpenHouseViewResult)
    async RunsamplereOpenHouseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereOpenHouseViewResult)
    async RunsamplereOpenHouseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Open Houses';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereOpenHouse_, { nullable: true })
    async samplereOpenHouse(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereOpenHouse_ | null> {
        this.CheckUserReadPermissions('Open Houses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwOpenHouses] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Open Houses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Open Houses', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplereOpenHouse_)
    async CreatesamplereOpenHouse(
        @Arg('input', () => CreatesamplereOpenHouseInput) input: CreatesamplereOpenHouseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Open Houses', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereOpenHouse_)
    async UpdatesamplereOpenHouse(
        @Arg('input', () => UpdatesamplereOpenHouseInput) input: UpdatesamplereOpenHouseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Open Houses', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereOpenHouse_)
    async DeletesamplereOpenHouse(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Open Houses', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Order Items
//****************************************************************************
@ObjectType({ description: `Individual items within a customer order` })
export class samplerestOrderItem_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    OrderID: string;
        
    @Field() 
    @MaxLength(16)
    MenuItemID: string;
        
    @Field(() => Int) 
    Quantity: number;
        
    @Field(() => Float) 
    UnitPrice: number;
        
    @Field({nullable: true, description: `Guest dietary modification or preference notes`}) 
    @MaxLength(1000)
    SpecialInstructions?: string;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    MenuItem: string;
        
}

//****************************************************************************
// INPUT TYPE for Order Items
//****************************************************************************
@InputType()
export class CreatesamplerestOrderItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderID?: string;

    @Field({ nullable: true })
    MenuItemID?: string;

    @Field(() => Int, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    SpecialInstructions: string | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Order Items
//****************************************************************************
@InputType()
export class UpdatesamplerestOrderItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderID?: string;

    @Field({ nullable: true })
    MenuItemID?: string;

    @Field(() => Int, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    SpecialInstructions?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Order Items
//****************************************************************************
@ObjectType()
export class RunsamplerestOrderItemViewResult {
    @Field(() => [samplerestOrderItem_])
    Results: samplerestOrderItem_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestOrderItem_)
export class samplerestOrderItemResolver extends ResolverBase {
    @Query(() => RunsamplerestOrderItemViewResult)
    async RunsamplerestOrderItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestOrderItemViewResult)
    async RunsamplerestOrderItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestOrderItemViewResult)
    async RunsamplerestOrderItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Order Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestOrderItem_, { nullable: true })
    async samplerestOrderItem(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestOrderItem_ | null> {
        this.CheckUserReadPermissions('Order Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwOrderItems] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Order Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Order Items', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplerestOrderItem_)
    async CreatesamplerestOrderItem(
        @Arg('input', () => CreatesamplerestOrderItemInput) input: CreatesamplerestOrderItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Order Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestOrderItem_)
    async UpdatesamplerestOrderItem(
        @Arg('input', () => UpdatesamplerestOrderItemInput) input: UpdatesamplerestOrderItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Order Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestOrderItem_)
    async DeletesamplerestOrderItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Order Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Owners
//****************************************************************************
@ObjectType({ description: `Property owners` })
export class samplepropertyOwner_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    FirstName: string;
        
    @Field() 
    @MaxLength(100)
    LastName: string;
        
    @Field() 
    @MaxLength(400)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(600)
    Address?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplepropertyProperty_])
    Properties__sample_property_OwnerIDArray: samplepropertyProperty_[]; // Link to Properties__sample_property
    
}

//****************************************************************************
// INPUT TYPE for Owners
//****************************************************************************
@InputType()
export class CreatesamplepropertyOwnerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Owners
//****************************************************************************
@InputType()
export class UpdatesamplepropertyOwnerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Owners
//****************************************************************************
@ObjectType()
export class RunsamplepropertyOwnerViewResult {
    @Field(() => [samplepropertyOwner_])
    Results: samplepropertyOwner_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyOwner_)
export class samplepropertyOwnerResolver extends ResolverBase {
    @Query(() => RunsamplepropertyOwnerViewResult)
    async RunsamplepropertyOwnerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyOwnerViewResult)
    async RunsamplepropertyOwnerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyOwnerViewResult)
    async RunsamplepropertyOwnerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Owners';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyOwner_, { nullable: true })
    async samplepropertyOwner(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyOwner_ | null> {
        this.CheckUserReadPermissions('Owners', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwOwners] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Owners', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Owners', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplepropertyProperty_])
    async Properties__sample_property_OwnerIDArray(@Root() samplepropertyowner_: samplepropertyOwner_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Properties__sample_property', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwProperties__sample_property] WHERE [OwnerID]='${samplepropertyowner_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Properties__sample_property', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Properties__sample_property', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplepropertyOwner_)
    async CreatesamplepropertyOwner(
        @Arg('input', () => CreatesamplepropertyOwnerInput) input: CreatesamplepropertyOwnerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Owners', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyOwner_)
    async UpdatesamplepropertyOwner(
        @Arg('input', () => UpdatesamplepropertyOwnerInput) input: UpdatesamplepropertyOwnerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Owners', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyOwner_)
    async DeletesamplepropertyOwner(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Owners', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Patrons
//****************************************************************************
@ObjectType({ description: `Library patrons/members` })
export class samplelibPatron_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Library card number for patron identification`}) 
    @MaxLength(20)
    CardNumber: string;
        
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
    @MaxLength(20)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    DateOfBirth?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(600)
    Address?: string;
        
    @Field() 
    @MaxLength(8)
    JoinDate: Date;
        
    @Field() 
    @MaxLength(16)
    HomeBranchID: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field(() => Int, {description: `Maximum number of books a patron can check out simultaneously`}) 
    MaxCheckouts: number;
        
    @Field(() => Float, {description: `Total outstanding fines owed by the patron`}) 
    FinesOwed: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    HomeBranch: string;
        
    @Field(() => [samplelibFine_])
    Fines_PatronIDArray: samplelibFine_[]; // Link to Fines
    
    @Field(() => [samplelibCheckout_])
    Checkouts_PatronIDArray: samplelibCheckout_[]; // Link to Checkouts
    
}

//****************************************************************************
// INPUT TYPE for Patrons
//****************************************************************************
@InputType()
export class CreatesamplelibPatronInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CardNumber?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    DateOfBirth: Date | null;

    @Field({ nullable: true })
    Address: string | null;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field({ nullable: true })
    HomeBranchID?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => Int, { nullable: true })
    MaxCheckouts?: number;

    @Field(() => Float, { nullable: true })
    FinesOwed?: number;
}
    

//****************************************************************************
// INPUT TYPE for Patrons
//****************************************************************************
@InputType()
export class UpdatesamplelibPatronInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CardNumber?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    DateOfBirth?: Date | null;

    @Field({ nullable: true })
    Address?: string | null;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field({ nullable: true })
    HomeBranchID?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => Int, { nullable: true })
    MaxCheckouts?: number;

    @Field(() => Float, { nullable: true })
    FinesOwed?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Patrons
//****************************************************************************
@ObjectType()
export class RunsamplelibPatronViewResult {
    @Field(() => [samplelibPatron_])
    Results: samplelibPatron_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplelibPatron_)
export class samplelibPatronResolver extends ResolverBase {
    @Query(() => RunsamplelibPatronViewResult)
    async RunsamplelibPatronViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibPatronViewResult)
    async RunsamplelibPatronViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplelibPatronViewResult)
    async RunsamplelibPatronDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Patrons';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplelibPatron_, { nullable: true })
    async samplelibPatron(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplelibPatron_ | null> {
        this.CheckUserReadPermissions('Patrons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwPatrons] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Patrons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Patrons', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplelibFine_])
    async Fines_PatronIDArray(@Root() samplelibpatron_: samplelibPatron_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Fines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwFines] WHERE [PatronID]='${samplelibpatron_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Fines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Fines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplelibCheckout_])
    async Checkouts_PatronIDArray(@Root() samplelibpatron_: samplelibPatron_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Checkouts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_lib].[vwCheckouts] WHERE [PatronID]='${samplelibpatron_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Checkouts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Checkouts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplelibPatron_)
    async CreatesamplelibPatron(
        @Arg('input', () => CreatesamplelibPatronInput) input: CreatesamplelibPatronInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Patrons', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplelibPatron_)
    async UpdatesamplelibPatron(
        @Arg('input', () => UpdatesamplelibPatronInput) input: UpdatesamplelibPatronInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Patrons', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplelibPatron_)
    async DeletesamplelibPatron(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Patrons', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payments
//****************************************************************************
@ObjectType({ description: `Payment transactions for memberships and services` })
export class samplefitPayment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field() 
    @MaxLength(8)
    PaymentDate: Date;
        
    @Field({description: `Payment method: Credit, Debit, Cash, ACH, Check`}) 
    @MaxLength(20)
    PaymentMethod: string;
        
    @Field() 
    @MaxLength(600)
    Description: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    ReferenceNumber?: string;
        
    @Field(() => Boolean) 
    IsRefund: boolean;
        
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
export class CreatesamplefitPaymentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    ReferenceNumber: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRefund?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Payments
//****************************************************************************
@InputType()
export class UpdatesamplefitPaymentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    ReferenceNumber?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRefund?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payments
//****************************************************************************
@ObjectType()
export class RunsamplefitPaymentViewResult {
    @Field(() => [samplefitPayment_])
    Results: samplefitPayment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitPayment_)
export class samplefitPaymentResolver extends ResolverBase {
    @Query(() => RunsamplefitPaymentViewResult)
    async RunsamplefitPaymentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitPaymentViewResult)
    async RunsamplefitPaymentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitPaymentViewResult)
    async RunsamplefitPaymentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitPayment_, { nullable: true })
    async samplefitPayment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitPayment_ | null> {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwPayments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Payments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplefitPayment_)
    async CreatesamplefitPayment(
        @Arg('input', () => CreatesamplefitPaymentInput) input: CreatesamplefitPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitPayment_)
    async UpdatesamplefitPayment(
        @Arg('input', () => UpdatesamplefitPaymentInput) input: UpdatesamplefitPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitPayment_)
    async DeletesamplefitPayment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Payments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payments__sample_property
//****************************************************************************
@ObjectType({ description: `Rent payments` })
export class samplepropertyPayment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    LeaseID: string;
        
    @Field() 
    @MaxLength(3)
    PaymentDate: Date;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field() 
    @MaxLength(40)
    PaymentMethod: string;
        
    @Field(() => Boolean) 
    IsLatePayment: boolean;
        
    @Field(() => Float) 
    LateFee: number;
        
    @Field({nullable: true}) 
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
// INPUT TYPE for Payments__sample_property
//****************************************************************************
@InputType()
export class CreatesamplepropertyPaymentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    LeaseID?: string;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field(() => Boolean, { nullable: true })
    IsLatePayment?: boolean;

    @Field(() => Float, { nullable: true })
    LateFee?: number;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Payments__sample_property
//****************************************************************************
@InputType()
export class UpdatesamplepropertyPaymentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    LeaseID?: string;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    PaymentMethod?: string;

    @Field(() => Boolean, { nullable: true })
    IsLatePayment?: boolean;

    @Field(() => Float, { nullable: true })
    LateFee?: number;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payments__sample_property
//****************************************************************************
@ObjectType()
export class RunsamplepropertyPaymentViewResult {
    @Field(() => [samplepropertyPayment_])
    Results: samplepropertyPayment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyPayment_)
export class samplepropertyPaymentResolver extends ResolverBase {
    @Query(() => RunsamplepropertyPaymentViewResult)
    async RunsamplepropertyPaymentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyPaymentViewResult)
    async RunsamplepropertyPaymentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyPaymentViewResult)
    async RunsamplepropertyPaymentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payments__sample_property';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyPayment_, { nullable: true })
    async samplepropertyPayment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyPayment_ | null> {
        this.CheckUserReadPermissions('Payments__sample_property', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwPayments__sample_property] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments__sample_property', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Payments__sample_property', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplepropertyPayment_)
    async CreatesamplepropertyPayment(
        @Arg('input', () => CreatesamplepropertyPaymentInput) input: CreatesamplepropertyPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payments__sample_property', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyPayment_)
    async UpdatesamplepropertyPayment(
        @Arg('input', () => UpdatesamplepropertyPaymentInput) input: UpdatesamplepropertyPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payments__sample_property', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyPayment_)
    async DeletesamplepropertyPayment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Payments__sample_property', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Personal Training Sessions
//****************************************************************************
@ObjectType({ description: `One-on-one personal training sessions` })
export class samplefitPersonalTrainingSession_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    TrainerID: string;
        
    @Field() 
    @MaxLength(16)
    MemberID: string;
        
    @Field() 
    @MaxLength(3)
    SessionDate: Date;
        
    @Field() 
    @MaxLength(5)
    StartTime: Date;
        
    @Field(() => Int) 
    DurationMinutes: number;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field(() => Int, {nullable: true, description: `Session rating by member (1-5 scale)`}) 
    Rating?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Personal Training Sessions
//****************************************************************************
@InputType()
export class CreatesamplefitPersonalTrainingSessionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TrainerID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    SessionDate?: Date;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => Int, { nullable: true })
    Rating: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Personal Training Sessions
//****************************************************************************
@InputType()
export class UpdatesamplefitPersonalTrainingSessionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TrainerID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    SessionDate?: Date;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => Int, { nullable: true })
    Rating?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Personal Training Sessions
//****************************************************************************
@ObjectType()
export class RunsamplefitPersonalTrainingSessionViewResult {
    @Field(() => [samplefitPersonalTrainingSession_])
    Results: samplefitPersonalTrainingSession_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitPersonalTrainingSession_)
export class samplefitPersonalTrainingSessionResolver extends ResolverBase {
    @Query(() => RunsamplefitPersonalTrainingSessionViewResult)
    async RunsamplefitPersonalTrainingSessionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitPersonalTrainingSessionViewResult)
    async RunsamplefitPersonalTrainingSessionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitPersonalTrainingSessionViewResult)
    async RunsamplefitPersonalTrainingSessionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Personal Training Sessions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitPersonalTrainingSession_, { nullable: true })
    async samplefitPersonalTrainingSession(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitPersonalTrainingSession_ | null> {
        this.CheckUserReadPermissions('Personal Training Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwPersonalTrainingSessions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Personal Training Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Personal Training Sessions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplefitPersonalTrainingSession_)
    async CreatesamplefitPersonalTrainingSession(
        @Arg('input', () => CreatesamplefitPersonalTrainingSessionInput) input: CreatesamplefitPersonalTrainingSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Personal Training Sessions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitPersonalTrainingSession_)
    async UpdatesamplefitPersonalTrainingSession(
        @Arg('input', () => UpdatesamplefitPersonalTrainingSessionInput) input: UpdatesamplefitPersonalTrainingSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Personal Training Sessions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitPersonalTrainingSession_)
    async DeletesamplefitPersonalTrainingSession(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Personal Training Sessions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Priorities
//****************************************************************************
@ObjectType({ description: `Ticket priority levels with SLA thresholds` })
export class samplehdPriority_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    Name: string;
        
    @Field(() => Int, {description: `Display order for priority listing (lower = higher priority)`}) 
    SortOrder: number;
        
    @Field({nullable: true}) 
    @MaxLength(7)
    ColorHex?: string;
        
    @Field(() => Int, {nullable: true, description: `SLA target for initial response in minutes`}) 
    SLAResponseMinutes?: number;
        
    @Field(() => Int, {nullable: true, description: `SLA target for full resolution in minutes`}) 
    SLAResolutionMinutes?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplehdTicket_])
    Tickets_PriorityIDArray: samplehdTicket_[]; // Link to Tickets
    
}

//****************************************************************************
// INPUT TYPE for Priorities
//****************************************************************************
@InputType()
export class CreatesamplehdPriorityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field({ nullable: true })
    ColorHex: string | null;

    @Field(() => Int, { nullable: true })
    SLAResponseMinutes: number | null;

    @Field(() => Int, { nullable: true })
    SLAResolutionMinutes: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Priorities
//****************************************************************************
@InputType()
export class UpdatesamplehdPriorityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field({ nullable: true })
    ColorHex?: string | null;

    @Field(() => Int, { nullable: true })
    SLAResponseMinutes?: number | null;

    @Field(() => Int, { nullable: true })
    SLAResolutionMinutes?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Priorities
//****************************************************************************
@ObjectType()
export class RunsamplehdPriorityViewResult {
    @Field(() => [samplehdPriority_])
    Results: samplehdPriority_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdPriority_)
export class samplehdPriorityResolver extends ResolverBase {
    @Query(() => RunsamplehdPriorityViewResult)
    async RunsamplehdPriorityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdPriorityViewResult)
    async RunsamplehdPriorityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdPriorityViewResult)
    async RunsamplehdPriorityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Priorities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdPriority_, { nullable: true })
    async samplehdPriority(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdPriority_ | null> {
        this.CheckUserReadPermissions('Priorities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwPriorities] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Priorities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Priorities', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplehdTicket_])
    async Tickets_PriorityIDArray(@Root() samplehdpriority_: samplehdPriority_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTickets] WHERE [PriorityID]='${samplehdpriority_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplehdPriority_)
    async CreatesamplehdPriority(
        @Arg('input', () => CreatesamplehdPriorityInput) input: CreatesamplehdPriorityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Priorities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdPriority_)
    async UpdatesamplehdPriority(
        @Arg('input', () => UpdatesamplehdPriorityInput) input: UpdatesamplehdPriorityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Priorities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdPriority_)
    async DeletesamplehdPriority(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Priorities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Properties
//****************************************************************************
@ObjectType({ description: `Real estate property listings` })
export class samplereProperty_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(600)
    Address: string;
        
    @Field() 
    @MaxLength(200)
    City: string;
        
    @Field() 
    @MaxLength(2)
    State: string;
        
    @Field() 
    @MaxLength(10)
    ZipCode: string;
        
    @Field() 
    @MaxLength(16)
    PropertyTypeID: string;
        
    @Field(() => Int) 
    Bedrooms: number;
        
    @Field(() => Float) 
    Bathrooms: number;
        
    @Field(() => Int, {description: `Total livable area in square feet`}) 
    SquareFeet: number;
        
    @Field(() => Float, {nullable: true, description: `Lot size in acres for the property parcel`}) 
    LotSizeAcres?: number;
        
    @Field(() => Int, {nullable: true}) 
    YearBuilt?: number;
        
    @Field(() => Float, {description: `Asking price for the property`}) 
    ListPrice: number;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(16)
    AgentID: string;
        
    @Field({description: `Current listing status: Active, Pending, Sold, Withdrawn, or Rented`}) 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    @MaxLength(8)
    ListedAt: Date;
        
    @Field(() => Boolean) 
    IsForSale: boolean;
        
    @Field(() => Boolean) 
    IsForRent: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    PropertyType: string;
        
    @Field(() => [samplerePropertyImage_])
    PropertyImages_PropertyIDArray: samplerePropertyImage_[]; // Link to PropertyImages
    
    @Field(() => [samplereOpenHouse_])
    OpenHouses_PropertyIDArray: samplereOpenHouse_[]; // Link to OpenHouses
    
    @Field(() => [samplereOffer_])
    Offers_PropertyIDArray: samplereOffer_[]; // Link to Offers
    
    @Field(() => [samplereShowing_])
    Showings_PropertyIDArray: samplereShowing_[]; // Link to Showings
    
    @Field(() => [samplereTransaction_])
    Transactions_PropertyIDArray: samplereTransaction_[]; // Link to Transactions
    
}

//****************************************************************************
// INPUT TYPE for Properties
//****************************************************************************
@InputType()
export class CreatesamplerePropertyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    PropertyTypeID?: string;

    @Field(() => Int, { nullable: true })
    Bedrooms?: number;

    @Field(() => Float, { nullable: true })
    Bathrooms?: number;

    @Field(() => Int, { nullable: true })
    SquareFeet?: number;

    @Field(() => Float, { nullable: true })
    LotSizeAcres: number | null;

    @Field(() => Int, { nullable: true })
    YearBuilt: number | null;

    @Field(() => Float, { nullable: true })
    ListPrice?: number;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ListedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsForSale?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsForRent?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Properties
//****************************************************************************
@InputType()
export class UpdatesamplerePropertyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    PropertyTypeID?: string;

    @Field(() => Int, { nullable: true })
    Bedrooms?: number;

    @Field(() => Float, { nullable: true })
    Bathrooms?: number;

    @Field(() => Int, { nullable: true })
    SquareFeet?: number;

    @Field(() => Float, { nullable: true })
    LotSizeAcres?: number | null;

    @Field(() => Int, { nullable: true })
    YearBuilt?: number | null;

    @Field(() => Float, { nullable: true })
    ListPrice?: number;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ListedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsForSale?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsForRent?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Properties
//****************************************************************************
@ObjectType()
export class RunsamplerePropertyViewResult {
    @Field(() => [samplereProperty_])
    Results: samplereProperty_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereProperty_)
export class samplerePropertyResolver extends ResolverBase {
    @Query(() => RunsamplerePropertyViewResult)
    async RunsamplerePropertyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerePropertyViewResult)
    async RunsamplerePropertyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerePropertyViewResult)
    async RunsamplerePropertyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Properties';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereProperty_, { nullable: true })
    async samplereProperty(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereProperty_ | null> {
        this.CheckUserReadPermissions('Properties', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwProperties] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Properties', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Properties', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplerePropertyImage_])
    async PropertyImages_PropertyIDArray(@Root() samplereproperty_: samplereProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Property Images', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwPropertyImages] WHERE [PropertyID]='${samplereproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Property Images', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Property Images', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereOpenHouse_])
    async OpenHouses_PropertyIDArray(@Root() samplereproperty_: samplereProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Open Houses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwOpenHouses] WHERE [PropertyID]='${samplereproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Open Houses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Open Houses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereOffer_])
    async Offers_PropertyIDArray(@Root() samplereproperty_: samplereProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Offers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwOffers] WHERE [PropertyID]='${samplereproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Offers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Offers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereShowing_])
    async Showings_PropertyIDArray(@Root() samplereproperty_: samplereProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Showings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwShowings] WHERE [PropertyID]='${samplereproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Showings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Showings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplereTransaction_])
    async Transactions_PropertyIDArray(@Root() samplereproperty_: samplereProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwTransactions] WHERE [PropertyID]='${samplereproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplereProperty_)
    async CreatesamplereProperty(
        @Arg('input', () => CreatesamplerePropertyInput) input: CreatesamplerePropertyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Properties', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereProperty_)
    async UpdatesamplereProperty(
        @Arg('input', () => UpdatesamplerePropertyInput) input: UpdatesamplerePropertyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Properties', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereProperty_)
    async DeletesamplereProperty(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Properties', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Properties__sample_property
//****************************************************************************
@ObjectType({ description: `Real estate properties` })
export class samplepropertyProperty_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field() 
    @MaxLength(600)
    Address: string;
        
    @Field() 
    @MaxLength(200)
    City: string;
        
    @Field() 
    @MaxLength(2)
    State: string;
        
    @Field() 
    @MaxLength(10)
    ZipCode: string;
        
    @Field() 
    @MaxLength(16)
    PropertyTypeID: string;
        
    @Field() 
    @MaxLength(16)
    OwnerID: string;
        
    @Field(() => Int) 
    SquareFootage: number;
        
    @Field(() => Int, {nullable: true}) 
    Bedrooms?: number;
        
    @Field(() => Float, {nullable: true, description: `Number of half-baths counted as 0.5`}) 
    Bathrooms?: number;
        
    @Field(() => Int) 
    YearBuilt: number;
        
    @Field(() => Float) 
    PurchasePrice: number;
        
    @Field(() => Float, {nullable: true}) 
    CurrentValue?: number;
        
    @Field(() => Boolean) 
    IsAvailable: boolean;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    PropertyType: string;
        
    @Field(() => [samplepropertyMaintenanceRequest_])
    MaintenanceRequests_PropertyIDArray: samplepropertyMaintenanceRequest_[]; // Link to MaintenanceRequests
    
    @Field(() => [samplepropertyInspection_])
    Inspections_PropertyIDArray: samplepropertyInspection_[]; // Link to Inspections
    
    @Field(() => [samplepropertyLease_])
    Leases_PropertyIDArray: samplepropertyLease_[]; // Link to Leases
    
}

//****************************************************************************
// INPUT TYPE for Properties__sample_property
//****************************************************************************
@InputType()
export class CreatesamplepropertyPropertyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    PropertyTypeID?: string;

    @Field({ nullable: true })
    OwnerID?: string;

    @Field(() => Int, { nullable: true })
    SquareFootage?: number;

    @Field(() => Int, { nullable: true })
    Bedrooms: number | null;

    @Field(() => Float, { nullable: true })
    Bathrooms: number | null;

    @Field(() => Int, { nullable: true })
    YearBuilt?: number;

    @Field(() => Float, { nullable: true })
    PurchasePrice?: number;

    @Field(() => Float, { nullable: true })
    CurrentValue: number | null;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field({ nullable: true })
    Description: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Properties__sample_property
//****************************************************************************
@InputType()
export class UpdatesamplepropertyPropertyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Address?: string;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    ZipCode?: string;

    @Field({ nullable: true })
    PropertyTypeID?: string;

    @Field({ nullable: true })
    OwnerID?: string;

    @Field(() => Int, { nullable: true })
    SquareFootage?: number;

    @Field(() => Int, { nullable: true })
    Bedrooms?: number | null;

    @Field(() => Float, { nullable: true })
    Bathrooms?: number | null;

    @Field(() => Int, { nullable: true })
    YearBuilt?: number;

    @Field(() => Float, { nullable: true })
    PurchasePrice?: number;

    @Field(() => Float, { nullable: true })
    CurrentValue?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Properties__sample_property
//****************************************************************************
@ObjectType()
export class RunsamplepropertyPropertyViewResult {
    @Field(() => [samplepropertyProperty_])
    Results: samplepropertyProperty_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyProperty_)
export class samplepropertyPropertyResolver extends ResolverBase {
    @Query(() => RunsamplepropertyPropertyViewResult)
    async RunsamplepropertyPropertyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyPropertyViewResult)
    async RunsamplepropertyPropertyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyPropertyViewResult)
    async RunsamplepropertyPropertyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Properties__sample_property';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyProperty_, { nullable: true })
    async samplepropertyProperty(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyProperty_ | null> {
        this.CheckUserReadPermissions('Properties__sample_property', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwProperties__sample_property] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Properties__sample_property', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Properties__sample_property', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplepropertyMaintenanceRequest_])
    async MaintenanceRequests_PropertyIDArray(@Root() samplepropertyproperty_: samplepropertyProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Maintenance Requests', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwMaintenanceRequests] WHERE [PropertyID]='${samplepropertyproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Maintenance Requests', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Maintenance Requests', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplepropertyInspection_])
    async Inspections_PropertyIDArray(@Root() samplepropertyproperty_: samplepropertyProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Inspections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwInspections] WHERE [PropertyID]='${samplepropertyproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Inspections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Inspections', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplepropertyLease_])
    async Leases_PropertyIDArray(@Root() samplepropertyproperty_: samplepropertyProperty_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Leases', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwLeases] WHERE [PropertyID]='${samplepropertyproperty_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Leases', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Leases', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplepropertyProperty_)
    async CreatesamplepropertyProperty(
        @Arg('input', () => CreatesamplepropertyPropertyInput) input: CreatesamplepropertyPropertyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Properties__sample_property', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyProperty_)
    async UpdatesamplepropertyProperty(
        @Arg('input', () => UpdatesamplepropertyPropertyInput) input: UpdatesamplepropertyPropertyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Properties__sample_property', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyProperty_)
    async DeletesamplepropertyProperty(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Properties__sample_property', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Property Images
//****************************************************************************
@ObjectType({ description: `Property listing photographs` })
export class samplerePropertyImage_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(1000)
    ImageURL: string;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Caption?: string;
        
    @Field(() => Int, {description: `Display order for property image gallery`}) 
    SortOrder: number;
        
    @Field(() => Boolean, {description: `Whether this is the primary listing photo`}) 
    IsPrimary: boolean;
        
    @Field() 
    @MaxLength(8)
    UploadedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Property Images
//****************************************************************************
@InputType()
export class CreatesamplerePropertyImageInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    ImageURL?: string;

    @Field({ nullable: true })
    Caption: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field({ nullable: true })
    UploadedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Property Images
//****************************************************************************
@InputType()
export class UpdatesamplerePropertyImageInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    ImageURL?: string;

    @Field({ nullable: true })
    Caption?: string | null;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field({ nullable: true })
    UploadedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Property Images
//****************************************************************************
@ObjectType()
export class RunsamplerePropertyImageViewResult {
    @Field(() => [samplerePropertyImage_])
    Results: samplerePropertyImage_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerePropertyImage_)
export class samplerePropertyImageResolver extends ResolverBase {
    @Query(() => RunsamplerePropertyImageViewResult)
    async RunsamplerePropertyImageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerePropertyImageViewResult)
    async RunsamplerePropertyImageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerePropertyImageViewResult)
    async RunsamplerePropertyImageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Property Images';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerePropertyImage_, { nullable: true })
    async samplerePropertyImage(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerePropertyImage_ | null> {
        this.CheckUserReadPermissions('Property Images', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwPropertyImages] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Property Images', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Property Images', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplerePropertyImage_)
    async CreatesamplerePropertyImage(
        @Arg('input', () => CreatesamplerePropertyImageInput) input: CreatesamplerePropertyImageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Property Images', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerePropertyImage_)
    async UpdatesamplerePropertyImage(
        @Arg('input', () => UpdatesamplerePropertyImageInput) input: UpdatesamplerePropertyImageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Property Images', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerePropertyImage_)
    async DeletesamplerePropertyImage(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Property Images', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Property Types
//****************************************************************************
@ObjectType({ description: `Lookup table for property classifications` })
export class samplerePropertyType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplereProperty_])
    Properties_PropertyTypeIDArray: samplereProperty_[]; // Link to Properties
    
}

//****************************************************************************
// INPUT TYPE for Property Types
//****************************************************************************
@InputType()
export class CreatesamplerePropertyTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Property Types
//****************************************************************************
@InputType()
export class UpdatesamplerePropertyTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Property Types
//****************************************************************************
@ObjectType()
export class RunsamplerePropertyTypeViewResult {
    @Field(() => [samplerePropertyType_])
    Results: samplerePropertyType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerePropertyType_)
export class samplerePropertyTypeResolver extends ResolverBase {
    @Query(() => RunsamplerePropertyTypeViewResult)
    async RunsamplerePropertyTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerePropertyTypeViewResult)
    async RunsamplerePropertyTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerePropertyTypeViewResult)
    async RunsamplerePropertyTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Property Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerePropertyType_, { nullable: true })
    async samplerePropertyType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerePropertyType_ | null> {
        this.CheckUserReadPermissions('Property Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwPropertyTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Property Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Property Types', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplereProperty_])
    async Properties_PropertyTypeIDArray(@Root() samplerepropertytype_: samplerePropertyType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Properties', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwProperties] WHERE [PropertyTypeID]='${samplerepropertytype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Properties', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Properties', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplerePropertyType_)
    async CreatesamplerePropertyType(
        @Arg('input', () => CreatesamplerePropertyTypeInput) input: CreatesamplerePropertyTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Property Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerePropertyType_)
    async UpdatesamplerePropertyType(
        @Arg('input', () => UpdatesamplerePropertyTypeInput) input: UpdatesamplerePropertyTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Property Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerePropertyType_)
    async DeletesamplerePropertyType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Property Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Property Types__sample_property
//****************************************************************************
@ObjectType({ description: `Property type classifications` })
export class samplepropertyPropertyType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Boolean) 
    IsResidential: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplepropertyProperty_])
    Properties__sample_property_PropertyTypeIDArray: samplepropertyProperty_[]; // Link to Properties__sample_property
    
}

//****************************************************************************
// INPUT TYPE for Property Types__sample_property
//****************************************************************************
@InputType()
export class CreatesamplepropertyPropertyTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsResidential?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Property Types__sample_property
//****************************************************************************
@InputType()
export class UpdatesamplepropertyPropertyTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsResidential?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Property Types__sample_property
//****************************************************************************
@ObjectType()
export class RunsamplepropertyPropertyTypeViewResult {
    @Field(() => [samplepropertyPropertyType_])
    Results: samplepropertyPropertyType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyPropertyType_)
export class samplepropertyPropertyTypeResolver extends ResolverBase {
    @Query(() => RunsamplepropertyPropertyTypeViewResult)
    async RunsamplepropertyPropertyTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyPropertyTypeViewResult)
    async RunsamplepropertyPropertyTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyPropertyTypeViewResult)
    async RunsamplepropertyPropertyTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Property Types__sample_property';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyPropertyType_, { nullable: true })
    async samplepropertyPropertyType(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyPropertyType_ | null> {
        this.CheckUserReadPermissions('Property Types__sample_property', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwPropertyTypes__sample_property] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Property Types__sample_property', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Property Types__sample_property', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplepropertyProperty_])
    async Properties__sample_property_PropertyTypeIDArray(@Root() samplepropertypropertytype_: samplepropertyPropertyType_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Properties__sample_property', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwProperties__sample_property] WHERE [PropertyTypeID]='${samplepropertypropertytype_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Properties__sample_property', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Properties__sample_property', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplepropertyPropertyType_)
    async CreatesamplepropertyPropertyType(
        @Arg('input', () => CreatesamplepropertyPropertyTypeInput) input: CreatesamplepropertyPropertyTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Property Types__sample_property', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyPropertyType_)
    async UpdatesamplepropertyPropertyType(
        @Arg('input', () => UpdatesamplepropertyPropertyTypeInput) input: UpdatesamplepropertyPropertyTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Property Types__sample_property', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyPropertyType_)
    async DeletesamplepropertyPropertyType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Property Types__sample_property', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Reservations
//****************************************************************************
@ObjectType({ description: `Guest reservation bookings` })
export class samplerestReservation_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(400)
    GuestName: string;
        
    @Field() 
    @MaxLength(20)
    GuestPhone: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    GuestEmail?: string;
        
    @Field(() => Int) 
    PartySize: number;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    TableID?: string;
        
    @Field() 
    @MaxLength(3)
    ReservationDate: Date;
        
    @Field() 
    @MaxLength(5)
    ReservationTime: Date;
        
    @Field({description: `Current status of the reservation`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Reservations
//****************************************************************************
@InputType()
export class CreatesamplerestReservationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    GuestName?: string;

    @Field({ nullable: true })
    GuestPhone?: string;

    @Field({ nullable: true })
    GuestEmail: string | null;

    @Field(() => Int, { nullable: true })
    PartySize?: number;

    @Field({ nullable: true })
    TableID: string | null;

    @Field({ nullable: true })
    ReservationDate?: Date;

    @Field({ nullable: true })
    ReservationTime?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Reservations
//****************************************************************************
@InputType()
export class UpdatesamplerestReservationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    GuestName?: string;

    @Field({ nullable: true })
    GuestPhone?: string;

    @Field({ nullable: true })
    GuestEmail?: string | null;

    @Field(() => Int, { nullable: true })
    PartySize?: number;

    @Field({ nullable: true })
    TableID?: string | null;

    @Field({ nullable: true })
    ReservationDate?: Date;

    @Field({ nullable: true })
    ReservationTime?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Reservations
//****************************************************************************
@ObjectType()
export class RunsamplerestReservationViewResult {
    @Field(() => [samplerestReservation_])
    Results: samplerestReservation_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestReservation_)
export class samplerestReservationResolver extends ResolverBase {
    @Query(() => RunsamplerestReservationViewResult)
    async RunsamplerestReservationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestReservationViewResult)
    async RunsamplerestReservationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestReservationViewResult)
    async RunsamplerestReservationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Reservations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestReservation_, { nullable: true })
    async samplerestReservation(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestReservation_ | null> {
        this.CheckUserReadPermissions('Reservations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwReservations] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Reservations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Reservations', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplerestReservation_)
    async CreatesamplerestReservation(
        @Arg('input', () => CreatesamplerestReservationInput) input: CreatesamplerestReservationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Reservations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestReservation_)
    async UpdatesamplerestReservation(
        @Arg('input', () => UpdatesamplerestReservationInput) input: UpdatesamplerestReservationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Reservations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestReservation_)
    async DeletesamplerestReservation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Reservations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Showings
//****************************************************************************
@ObjectType({ description: `Scheduled property viewings` })
export class samplereShowing_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(16)
    ClientID: string;
        
    @Field() 
    @MaxLength(16)
    AgentID: string;
        
    @Field() 
    @MaxLength(8)
    ScheduledAt: Date;
        
    @Field(() => Int) 
    DurationMinutes: number;
        
    @Field({nullable: true}) 
    Feedback?: string;
        
    @Field(() => Int, {nullable: true, description: `Client rating of the showing experience (1-5)`}) 
    Rating?: number;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Showings
//****************************************************************************
@InputType()
export class CreatesamplereShowingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    ClientID?: string;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    ScheduledAt?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number;

    @Field({ nullable: true })
    Feedback: string | null;

    @Field(() => Int, { nullable: true })
    Rating: number | null;

    @Field({ nullable: true })
    Status?: string;
}
    

//****************************************************************************
// INPUT TYPE for Showings
//****************************************************************************
@InputType()
export class UpdatesamplereShowingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    ClientID?: string;

    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    ScheduledAt?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number;

    @Field({ nullable: true })
    Feedback?: string | null;

    @Field(() => Int, { nullable: true })
    Rating?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Showings
//****************************************************************************
@ObjectType()
export class RunsamplereShowingViewResult {
    @Field(() => [samplereShowing_])
    Results: samplereShowing_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereShowing_)
export class samplereShowingResolver extends ResolverBase {
    @Query(() => RunsamplereShowingViewResult)
    async RunsamplereShowingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereShowingViewResult)
    async RunsamplereShowingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereShowingViewResult)
    async RunsamplereShowingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Showings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereShowing_, { nullable: true })
    async samplereShowing(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereShowing_ | null> {
        this.CheckUserReadPermissions('Showings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwShowings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Showings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Showings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplereShowing_)
    async CreatesamplereShowing(
        @Arg('input', () => CreatesamplereShowingInput) input: CreatesamplereShowingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Showings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereShowing_)
    async UpdatesamplereShowing(
        @Arg('input', () => UpdatesamplereShowingInput) input: UpdatesamplereShowingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Showings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereShowing_)
    async DeletesamplereShowing(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Showings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Staffs
//****************************************************************************
@ObjectType({ description: `Restaurant staff members` })
export class samplerestStaff_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field() 
    @MaxLength(20)
    Phone: string;
        
    @Field({description: `Staff role determining job responsibilities`}) 
    @MaxLength(20)
    Role: string;
        
    @Field(() => Float) 
    HourlyRate: number;
        
    @Field() 
    @MaxLength(3)
    HireDate: Date;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplerestCustomerOrder_])
    CustomerOrders_ServerIDArray: samplerestCustomerOrder_[]; // Link to CustomerOrders
    
}

//****************************************************************************
// INPUT TYPE for Staffs
//****************************************************************************
@InputType()
export class CreatesamplerestStaffInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Role?: string;

    @Field(() => Float, { nullable: true })
    HourlyRate?: number;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Staffs
//****************************************************************************
@InputType()
export class UpdatesamplerestStaffInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Role?: string;

    @Field(() => Float, { nullable: true })
    HourlyRate?: number;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Staffs
//****************************************************************************
@ObjectType()
export class RunsamplerestStaffViewResult {
    @Field(() => [samplerestStaff_])
    Results: samplerestStaff_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestStaff_)
export class samplerestStaffResolver extends ResolverBase {
    @Query(() => RunsamplerestStaffViewResult)
    async RunsamplerestStaffViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestStaffViewResult)
    async RunsamplerestStaffViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestStaffViewResult)
    async RunsamplerestStaffDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Staffs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestStaff_, { nullable: true })
    async samplerestStaff(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestStaff_ | null> {
        this.CheckUserReadPermissions('Staffs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwStaffs] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Staffs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Staffs', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplerestCustomerOrder_])
    async CustomerOrders_ServerIDArray(@Root() samplereststaff_: samplerestStaff_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Customer Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwCustomerOrders] WHERE [ServerID]='${samplereststaff_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Customer Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Customer Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplerestStaff_)
    async CreatesamplerestStaff(
        @Arg('input', () => CreatesamplerestStaffInput) input: CreatesamplerestStaffInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Staffs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestStaff_)
    async UpdatesamplerestStaff(
        @Arg('input', () => UpdatesamplerestStaffInput) input: UpdatesamplerestStaffInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Staffs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestStaff_)
    async DeletesamplerestStaff(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Staffs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Support Agents
//****************************************************************************
@ObjectType({ description: `Help desk support agents and technicians` })
export class samplehdSupportAgent_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field() 
    @MaxLength(16)
    DepartmentID: string;
        
    @Field(() => Int, {description: `Support tier level: 1=Basic, 2=Advanced, 3=Expert`}) 
    Tier: number;
        
    @Field(() => Boolean) 
    IsAvailable: boolean;
        
    @Field() 
    @MaxLength(8)
    HireDate: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(300)
    Department: string;
        
    @Field(() => [samplehdKnowledgeArticle_])
    KnowledgeArticles_AuthorAgentIDArray: samplehdKnowledgeArticle_[]; // Link to KnowledgeArticles
    
    @Field(() => [samplehdTicket_])
    Tickets_AssignedAgentIDArray: samplehdTicket_[]; // Link to Tickets
    
}

//****************************************************************************
// INPUT TYPE for Support Agents
//****************************************************************************
@InputType()
export class CreatesamplehdSupportAgentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    DepartmentID?: string;

    @Field(() => Int, { nullable: true })
    Tier?: number;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field({ nullable: true })
    HireDate?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Support Agents
//****************************************************************************
@InputType()
export class UpdatesamplehdSupportAgentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    DepartmentID?: string;

    @Field(() => Int, { nullable: true })
    Tier?: number;

    @Field(() => Boolean, { nullable: true })
    IsAvailable?: boolean;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Support Agents
//****************************************************************************
@ObjectType()
export class RunsamplehdSupportAgentViewResult {
    @Field(() => [samplehdSupportAgent_])
    Results: samplehdSupportAgent_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdSupportAgent_)
export class samplehdSupportAgentResolver extends ResolverBase {
    @Query(() => RunsamplehdSupportAgentViewResult)
    async RunsamplehdSupportAgentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdSupportAgentViewResult)
    async RunsamplehdSupportAgentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdSupportAgentViewResult)
    async RunsamplehdSupportAgentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Support Agents';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdSupportAgent_, { nullable: true })
    async samplehdSupportAgent(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdSupportAgent_ | null> {
        this.CheckUserReadPermissions('Support Agents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwSupportAgents] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Support Agents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Support Agents', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplehdKnowledgeArticle_])
    async KnowledgeArticles_AuthorAgentIDArray(@Root() samplehdsupportagent_: samplehdSupportAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Knowledge Articles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwKnowledgeArticles] WHERE [AuthorAgentID]='${samplehdsupportagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Knowledge Articles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Knowledge Articles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplehdTicket_])
    async Tickets_AssignedAgentIDArray(@Root() samplehdsupportagent_: samplehdSupportAgent_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTickets] WHERE [AssignedAgentID]='${samplehdsupportagent_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Tickets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplehdSupportAgent_)
    async CreatesamplehdSupportAgent(
        @Arg('input', () => CreatesamplehdSupportAgentInput) input: CreatesamplehdSupportAgentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Support Agents', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdSupportAgent_)
    async UpdatesamplehdSupportAgent(
        @Arg('input', () => UpdatesamplehdSupportAgentInput) input: UpdatesamplehdSupportAgentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Support Agents', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdSupportAgent_)
    async DeletesamplehdSupportAgent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Support Agents', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Table Seatings
//****************************************************************************
@ObjectType({ description: `Physical tables available for seating guests` })
export class samplerestTableSeating_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display number for the table (e.g. T1, B2)`}) 
    @MaxLength(10)
    TableNumber: string;
        
    @Field(() => Int, {description: `Maximum number of guests the table can accommodate`}) 
    Capacity: number;
        
    @Field() 
    @MaxLength(30)
    Section: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplerestReservation_])
    Reservations_TableIDArray: samplerestReservation_[]; // Link to Reservations
    
    @Field(() => [samplerestCustomerOrder_])
    CustomerOrders_TableIDArray: samplerestCustomerOrder_[]; // Link to CustomerOrders
    
}

//****************************************************************************
// INPUT TYPE for Table Seatings
//****************************************************************************
@InputType()
export class CreatesamplerestTableSeatingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TableNumber?: string;

    @Field(() => Int, { nullable: true })
    Capacity?: number;

    @Field({ nullable: true })
    Section?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Table Seatings
//****************************************************************************
@InputType()
export class UpdatesamplerestTableSeatingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TableNumber?: string;

    @Field(() => Int, { nullable: true })
    Capacity?: number;

    @Field({ nullable: true })
    Section?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Table Seatings
//****************************************************************************
@ObjectType()
export class RunsamplerestTableSeatingViewResult {
    @Field(() => [samplerestTableSeating_])
    Results: samplerestTableSeating_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplerestTableSeating_)
export class samplerestTableSeatingResolver extends ResolverBase {
    @Query(() => RunsamplerestTableSeatingViewResult)
    async RunsamplerestTableSeatingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestTableSeatingViewResult)
    async RunsamplerestTableSeatingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplerestTableSeatingViewResult)
    async RunsamplerestTableSeatingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Table Seatings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplerestTableSeating_, { nullable: true })
    async samplerestTableSeating(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplerestTableSeating_ | null> {
        this.CheckUserReadPermissions('Table Seatings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwTableSeatings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Table Seatings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Table Seatings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplerestReservation_])
    async Reservations_TableIDArray(@Root() sampleresttableseating_: samplerestTableSeating_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reservations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwReservations] WHERE [TableID]='${sampleresttableseating_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Reservations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Reservations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplerestCustomerOrder_])
    async CustomerOrders_TableIDArray(@Root() sampleresttableseating_: samplerestTableSeating_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Customer Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_rest].[vwCustomerOrders] WHERE [TableID]='${sampleresttableseating_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Customer Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Customer Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplerestTableSeating_)
    async CreatesamplerestTableSeating(
        @Arg('input', () => CreatesamplerestTableSeatingInput) input: CreatesamplerestTableSeatingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Table Seatings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplerestTableSeating_)
    async UpdatesamplerestTableSeating(
        @Arg('input', () => UpdatesamplerestTableSeatingInput) input: UpdatesamplerestTableSeatingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Table Seatings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplerestTableSeating_)
    async DeletesamplerestTableSeating(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Table Seatings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Tenants
//****************************************************************************
@ObjectType({ description: `Property tenants` })
export class samplepropertyTenant_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    FirstName: string;
        
    @Field() 
    @MaxLength(100)
    LastName: string;
        
    @Field() 
    @MaxLength(400)
    Email: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    DateOfBirth?: Date;
        
    @Field(() => Int, {nullable: true, description: `FICO credit score`}) 
    CreditScore?: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    EmergencyContact?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    EmergencyPhone?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplepropertyLease_])
    Leases_TenantIDArray: samplepropertyLease_[]; // Link to Leases
    
    @Field(() => [samplepropertyMaintenanceRequest_])
    MaintenanceRequests_TenantIDArray: samplepropertyMaintenanceRequest_[]; // Link to MaintenanceRequests
    
}

//****************************************************************************
// INPUT TYPE for Tenants
//****************************************************************************
@InputType()
export class CreatesamplepropertyTenantInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    DateOfBirth: Date | null;

    @Field(() => Int, { nullable: true })
    CreditScore: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    EmergencyContact: string | null;

    @Field({ nullable: true })
    EmergencyPhone: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Tenants
//****************************************************************************
@InputType()
export class UpdatesamplepropertyTenantInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    DateOfBirth?: Date | null;

    @Field(() => Int, { nullable: true })
    CreditScore?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    EmergencyContact?: string | null;

    @Field({ nullable: true })
    EmergencyPhone?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Tenants
//****************************************************************************
@ObjectType()
export class RunsamplepropertyTenantViewResult {
    @Field(() => [samplepropertyTenant_])
    Results: samplepropertyTenant_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplepropertyTenant_)
export class samplepropertyTenantResolver extends ResolverBase {
    @Query(() => RunsamplepropertyTenantViewResult)
    async RunsamplepropertyTenantViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyTenantViewResult)
    async RunsamplepropertyTenantViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplepropertyTenantViewResult)
    async RunsamplepropertyTenantDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Tenants';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplepropertyTenant_, { nullable: true })
    async samplepropertyTenant(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplepropertyTenant_ | null> {
        this.CheckUserReadPermissions('Tenants', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwTenants] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tenants', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Tenants', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplepropertyLease_])
    async Leases_TenantIDArray(@Root() samplepropertytenant_: samplepropertyTenant_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Leases', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwLeases] WHERE [TenantID]='${samplepropertytenant_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Leases', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Leases', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplepropertyMaintenanceRequest_])
    async MaintenanceRequests_TenantIDArray(@Root() samplepropertytenant_: samplepropertyTenant_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Maintenance Requests', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_property].[vwMaintenanceRequests] WHERE [TenantID]='${samplepropertytenant_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Maintenance Requests', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Maintenance Requests', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplepropertyTenant_)
    async CreatesamplepropertyTenant(
        @Arg('input', () => CreatesamplepropertyTenantInput) input: CreatesamplepropertyTenantInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Tenants', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplepropertyTenant_)
    async UpdatesamplepropertyTenant(
        @Arg('input', () => UpdatesamplepropertyTenantInput) input: UpdatesamplepropertyTenantInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Tenants', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplepropertyTenant_)
    async DeletesamplepropertyTenant(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Tenants', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Attachments
//****************************************************************************
@ObjectType({ description: `File attachments associated with tickets` })
export class samplehdTicketAttachment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    TicketID: string;
        
    @Field() 
    @MaxLength(600)
    FileName: string;
        
    @Field(() => Int) 
    FileSize: number;
        
    @Field() 
    @MaxLength(100)
    MimeType: string;
        
    @Field() 
    @MaxLength(1000)
    StoragePath: string;
        
    @Field() 
    @MaxLength(8)
    UploadedAt: Date;
        
    @Field() 
    @MaxLength(510)
    UploadedBy: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Attachments
//****************************************************************************
@InputType()
export class CreatesamplehdTicketAttachmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TicketID?: string;

    @Field({ nullable: true })
    FileName?: string;

    @Field(() => Int, { nullable: true })
    FileSize?: number;

    @Field({ nullable: true })
    MimeType?: string;

    @Field({ nullable: true })
    StoragePath?: string;

    @Field({ nullable: true })
    UploadedAt?: Date;

    @Field({ nullable: true })
    UploadedBy?: string;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Attachments
//****************************************************************************
@InputType()
export class UpdatesamplehdTicketAttachmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TicketID?: string;

    @Field({ nullable: true })
    FileName?: string;

    @Field(() => Int, { nullable: true })
    FileSize?: number;

    @Field({ nullable: true })
    MimeType?: string;

    @Field({ nullable: true })
    StoragePath?: string;

    @Field({ nullable: true })
    UploadedAt?: Date;

    @Field({ nullable: true })
    UploadedBy?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Attachments
//****************************************************************************
@ObjectType()
export class RunsamplehdTicketAttachmentViewResult {
    @Field(() => [samplehdTicketAttachment_])
    Results: samplehdTicketAttachment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdTicketAttachment_)
export class samplehdTicketAttachmentResolver extends ResolverBase {
    @Query(() => RunsamplehdTicketAttachmentViewResult)
    async RunsamplehdTicketAttachmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketAttachmentViewResult)
    async RunsamplehdTicketAttachmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketAttachmentViewResult)
    async RunsamplehdTicketAttachmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Attachments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdTicketAttachment_, { nullable: true })
    async samplehdTicketAttachment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdTicketAttachment_ | null> {
        this.CheckUserReadPermissions('Ticket Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTicketAttachments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Attachments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplehdTicketAttachment_)
    async CreatesamplehdTicketAttachment(
        @Arg('input', () => CreatesamplehdTicketAttachmentInput) input: CreatesamplehdTicketAttachmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Attachments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdTicketAttachment_)
    async UpdatesamplehdTicketAttachment(
        @Arg('input', () => UpdatesamplehdTicketAttachmentInput) input: UpdatesamplehdTicketAttachmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Attachments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdTicketAttachment_)
    async DeletesamplehdTicketAttachment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Ticket Attachments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Comments
//****************************************************************************
@ObjectType({ description: `Comments and notes on support tickets` })
export class samplehdTicketComment_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    TicketID: string;
        
    @Field() 
    @MaxLength(510)
    AuthorEmail: string;
        
    @Field() 
    @MaxLength(400)
    AuthorName: string;
        
    @Field() 
    Body: string;
        
    @Field(() => Boolean, {description: `Whether this comment is internal-only (not visible to requestor)`}) 
    IsInternal: boolean;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Comments
//****************************************************************************
@InputType()
export class CreatesamplehdTicketCommentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TicketID?: string;

    @Field({ nullable: true })
    AuthorEmail?: string;

    @Field({ nullable: true })
    AuthorName?: string;

    @Field({ nullable: true })
    Body?: string;

    @Field(() => Boolean, { nullable: true })
    IsInternal?: boolean;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Comments
//****************************************************************************
@InputType()
export class UpdatesamplehdTicketCommentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TicketID?: string;

    @Field({ nullable: true })
    AuthorEmail?: string;

    @Field({ nullable: true })
    AuthorName?: string;

    @Field({ nullable: true })
    Body?: string;

    @Field(() => Boolean, { nullable: true })
    IsInternal?: boolean;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Comments
//****************************************************************************
@ObjectType()
export class RunsamplehdTicketCommentViewResult {
    @Field(() => [samplehdTicketComment_])
    Results: samplehdTicketComment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdTicketComment_)
export class samplehdTicketCommentResolver extends ResolverBase {
    @Query(() => RunsamplehdTicketCommentViewResult)
    async RunsamplehdTicketCommentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketCommentViewResult)
    async RunsamplehdTicketCommentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketCommentViewResult)
    async RunsamplehdTicketCommentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Comments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdTicketComment_, { nullable: true })
    async samplehdTicketComment(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdTicketComment_ | null> {
        this.CheckUserReadPermissions('Ticket Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTicketComments] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Comments', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplehdTicketComment_)
    async CreatesamplehdTicketComment(
        @Arg('input', () => CreatesamplehdTicketCommentInput) input: CreatesamplehdTicketCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Comments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdTicketComment_)
    async UpdatesamplehdTicketComment(
        @Arg('input', () => UpdatesamplehdTicketCommentInput) input: UpdatesamplehdTicketCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Comments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdTicketComment_)
    async DeletesamplehdTicketComment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Ticket Comments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Ticket Tags
//****************************************************************************
@ObjectType({ description: `Tags applied to tickets for flexible categorization` })
export class samplehdTicketTag_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    TicketID: string;
        
    @Field() 
    @MaxLength(100)
    TagName: string;
        
    @Field() 
    @MaxLength(8)
    AddedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Ticket Tags
//****************************************************************************
@InputType()
export class CreatesamplehdTicketTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TicketID?: string;

    @Field({ nullable: true })
    TagName?: string;

    @Field({ nullable: true })
    AddedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Ticket Tags
//****************************************************************************
@InputType()
export class UpdatesamplehdTicketTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TicketID?: string;

    @Field({ nullable: true })
    TagName?: string;

    @Field({ nullable: true })
    AddedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Ticket Tags
//****************************************************************************
@ObjectType()
export class RunsamplehdTicketTagViewResult {
    @Field(() => [samplehdTicketTag_])
    Results: samplehdTicketTag_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdTicketTag_)
export class samplehdTicketTagResolver extends ResolverBase {
    @Query(() => RunsamplehdTicketTagViewResult)
    async RunsamplehdTicketTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketTagViewResult)
    async RunsamplehdTicketTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketTagViewResult)
    async RunsamplehdTicketTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Ticket Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdTicketTag_, { nullable: true })
    async samplehdTicketTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdTicketTag_ | null> {
        this.CheckUserReadPermissions('Ticket Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTicketTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Ticket Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplehdTicketTag_)
    async CreatesamplehdTicketTag(
        @Arg('input', () => CreatesamplehdTicketTagInput) input: CreatesamplehdTicketTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Ticket Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdTicketTag_)
    async UpdatesamplehdTicketTag(
        @Arg('input', () => UpdatesamplehdTicketTagInput) input: UpdatesamplehdTicketTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Ticket Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdTicketTag_)
    async DeletesamplehdTicketTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Ticket Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Tickets
//****************************************************************************
@ObjectType({ description: `Help desk support tickets from requestors` })
export class samplehdTicket_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Auto-generated human-readable ticket identifier`}) 
    @MaxLength(20)
    TicketNumber: string;
        
    @Field() 
    @MaxLength(600)
    Subject: string;
        
    @Field() 
    Description: string;
        
    @Field() 
    @MaxLength(510)
    RequestorEmail: string;
        
    @Field() 
    @MaxLength(400)
    RequestorName: string;
        
    @Field() 
    @MaxLength(16)
    CategoryID: string;
        
    @Field() 
    @MaxLength(16)
    PriorityID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    AssignedAgentID?: string;
        
    @Field({description: `Current ticket lifecycle status`}) 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ResolvedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ClosedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    DueDate?: Date;
        
    @Field(() => Boolean) 
    IsEscalated: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(300)
    Category: string;
        
    @Field() 
    @MaxLength(100)
    Priority: string;
        
    @Field(() => [samplehdTicketAttachment_])
    TicketAttachments_TicketIDArray: samplehdTicketAttachment_[]; // Link to TicketAttachments
    
    @Field(() => [samplehdTicketTag_])
    TicketTags_TicketIDArray: samplehdTicketTag_[]; // Link to TicketTags
    
    @Field(() => [samplehdTicketComment_])
    TicketComments_TicketIDArray: samplehdTicketComment_[]; // Link to TicketComments
    
}

//****************************************************************************
// INPUT TYPE for Tickets
//****************************************************************************
@InputType()
export class CreatesamplehdTicketInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TicketNumber?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    RequestorEmail?: string;

    @Field({ nullable: true })
    RequestorName?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    PriorityID?: string;

    @Field({ nullable: true })
    AssignedAgentID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;

    @Field({ nullable: true })
    ResolvedAt: Date | null;

    @Field({ nullable: true })
    ClosedAt: Date | null;

    @Field({ nullable: true })
    DueDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsEscalated?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Tickets
//****************************************************************************
@InputType()
export class UpdatesamplehdTicketInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TicketNumber?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    RequestorEmail?: string;

    @Field({ nullable: true })
    RequestorName?: string;

    @Field({ nullable: true })
    CategoryID?: string;

    @Field({ nullable: true })
    PriorityID?: string;

    @Field({ nullable: true })
    AssignedAgentID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field({ nullable: true })
    UpdatedAt?: Date;

    @Field({ nullable: true })
    ResolvedAt?: Date | null;

    @Field({ nullable: true })
    ClosedAt?: Date | null;

    @Field({ nullable: true })
    DueDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsEscalated?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Tickets
//****************************************************************************
@ObjectType()
export class RunsamplehdTicketViewResult {
    @Field(() => [samplehdTicket_])
    Results: samplehdTicket_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplehdTicket_)
export class samplehdTicketResolver extends ResolverBase {
    @Query(() => RunsamplehdTicketViewResult)
    async RunsamplehdTicketViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketViewResult)
    async RunsamplehdTicketViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplehdTicketViewResult)
    async RunsamplehdTicketDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Tickets';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplehdTicket_, { nullable: true })
    async samplehdTicket(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplehdTicket_ | null> {
        this.CheckUserReadPermissions('Tickets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTickets] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tickets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Tickets', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplehdTicketAttachment_])
    async TicketAttachments_TicketIDArray(@Root() samplehdticket_: samplehdTicket_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Attachments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTicketAttachments] WHERE [TicketID]='${samplehdticket_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Attachments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplehdTicketTag_])
    async TicketTags_TicketIDArray(@Root() samplehdticket_: samplehdTicket_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTicketTags] WHERE [TicketID]='${samplehdticket_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplehdTicketComment_])
    async TicketComments_TicketIDArray(@Root() samplehdticket_: samplehdTicket_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Ticket Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_hd].[vwTicketComments] WHERE [TicketID]='${samplehdticket_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Ticket Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Ticket Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplehdTicket_)
    async CreatesamplehdTicket(
        @Arg('input', () => CreatesamplehdTicketInput) input: CreatesamplehdTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Tickets', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplehdTicket_)
    async UpdatesamplehdTicket(
        @Arg('input', () => UpdatesamplehdTicketInput) input: UpdatesamplehdTicketInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Tickets', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplehdTicket_)
    async DeletesamplehdTicket(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Tickets', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Trainers
//****************************************************************************
@ObjectType({ description: `Personal trainers and fitness instructors` })
export class samplefitTrainer_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field() 
    @MaxLength(20)
    Phone: string;
        
    @Field() 
    @MaxLength(400)
    Specialization: string;
        
    @Field(() => Float, {description: `Trainer per-hour rate for personal training sessions`}) 
    HourlyRate: number;
        
    @Field({nullable: true}) 
    Bio?: string;
        
    @Field() 
    @MaxLength(16)
    LocationID: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field({description: `Date trainer obtained primary certification`}) 
    @MaxLength(3)
    CertifiedSince: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Location: string;
        
    @Field(() => [samplefitFitnessClass_])
    FitnessClasses_TrainerIDArray: samplefitFitnessClass_[]; // Link to FitnessClasses
    
    @Field(() => [samplefitPersonalTrainingSession_])
    PersonalTrainingSessions_TrainerIDArray: samplefitPersonalTrainingSession_[]; // Link to PersonalTrainingSessions
    
}

//****************************************************************************
// INPUT TYPE for Trainers
//****************************************************************************
@InputType()
export class CreatesamplefitTrainerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Specialization?: string;

    @Field(() => Float, { nullable: true })
    HourlyRate?: number;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    LocationID?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    CertifiedSince?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Trainers
//****************************************************************************
@InputType()
export class UpdatesamplefitTrainerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Specialization?: string;

    @Field(() => Float, { nullable: true })
    HourlyRate?: number;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    LocationID?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    CertifiedSince?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Trainers
//****************************************************************************
@ObjectType()
export class RunsamplefitTrainerViewResult {
    @Field(() => [samplefitTrainer_])
    Results: samplefitTrainer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplefitTrainer_)
export class samplefitTrainerResolver extends ResolverBase {
    @Query(() => RunsamplefitTrainerViewResult)
    async RunsamplefitTrainerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitTrainerViewResult)
    async RunsamplefitTrainerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplefitTrainerViewResult)
    async RunsamplefitTrainerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Trainers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplefitTrainer_, { nullable: true })
    async samplefitTrainer(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplefitTrainer_ | null> {
        this.CheckUserReadPermissions('Trainers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwTrainers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Trainers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Trainers', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplefitFitnessClass_])
    async FitnessClasses_TrainerIDArray(@Root() samplefittrainer_: samplefitTrainer_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Fitness Classes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwFitnessClasses] WHERE [TrainerID]='${samplefittrainer_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Fitness Classes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Fitness Classes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplefitPersonalTrainingSession_])
    async PersonalTrainingSessions_TrainerIDArray(@Root() samplefittrainer_: samplefitTrainer_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Personal Training Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_fit].[vwPersonalTrainingSessions] WHERE [TrainerID]='${samplefittrainer_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Personal Training Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Personal Training Sessions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplefitTrainer_)
    async CreatesamplefitTrainer(
        @Arg('input', () => CreatesamplefitTrainerInput) input: CreatesamplefitTrainerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Trainers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplefitTrainer_)
    async UpdatesamplefitTrainer(
        @Arg('input', () => UpdatesamplefitTrainerInput) input: UpdatesamplefitTrainerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Trainers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplefitTrainer_)
    async DeletesamplefitTrainer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Trainers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Transactions
//****************************************************************************
@ObjectType({ description: `Completed real estate transactions` })
export class samplereTransaction_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    PropertyID: string;
        
    @Field() 
    @MaxLength(16)
    BuyerID: string;
        
    @Field() 
    @MaxLength(16)
    SellerAgentID: string;
        
    @Field() 
    @MaxLength(16)
    BuyerAgentID: string;
        
    @Field(() => Float, {description: `Final sale price at closing`}) 
    SalePrice: number;
        
    @Field() 
    @MaxLength(3)
    ClosingDate: Date;
        
    @Field(() => Float, {description: `Total commission paid across both agents`}) 
    CommissionTotal: number;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    EscrowCompany?: string;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Transactions
//****************************************************************************
@InputType()
export class CreatesamplereTransactionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    BuyerID?: string;

    @Field({ nullable: true })
    SellerAgentID?: string;

    @Field({ nullable: true })
    BuyerAgentID?: string;

    @Field(() => Float, { nullable: true })
    SalePrice?: number;

    @Field({ nullable: true })
    ClosingDate?: Date;

    @Field(() => Float, { nullable: true })
    CommissionTotal?: number;

    @Field({ nullable: true })
    EscrowCompany: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Transactions
//****************************************************************************
@InputType()
export class UpdatesamplereTransactionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PropertyID?: string;

    @Field({ nullable: true })
    BuyerID?: string;

    @Field({ nullable: true })
    SellerAgentID?: string;

    @Field({ nullable: true })
    BuyerAgentID?: string;

    @Field(() => Float, { nullable: true })
    SalePrice?: number;

    @Field({ nullable: true })
    ClosingDate?: Date;

    @Field(() => Float, { nullable: true })
    CommissionTotal?: number;

    @Field({ nullable: true })
    EscrowCompany?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CreatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Transactions
//****************************************************************************
@ObjectType()
export class RunsamplereTransactionViewResult {
    @Field(() => [samplereTransaction_])
    Results: samplereTransaction_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplereTransaction_)
export class samplereTransactionResolver extends ResolverBase {
    @Query(() => RunsamplereTransactionViewResult)
    async RunsamplereTransactionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereTransactionViewResult)
    async RunsamplereTransactionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplereTransactionViewResult)
    async RunsamplereTransactionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Transactions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplereTransaction_, { nullable: true })
    async samplereTransaction(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplereTransaction_ | null> {
        this.CheckUserReadPermissions('Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_re].[vwTransactions] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Transactions', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplereTransaction_)
    async CreatesamplereTransaction(
        @Arg('input', () => CreatesamplereTransactionInput) input: CreatesamplereTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Transactions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplereTransaction_)
    async UpdatesamplereTransaction(
        @Arg('input', () => UpdatesamplereTransactionInput) input: UpdatesamplereTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Transactions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplereTransaction_)
    async DeletesamplereTransaction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Transactions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Volunteer Logs
//****************************************************************************
@ObjectType({ description: `Tracks volunteer hours and task descriptions` })
export class samplenpoVolunteerLog_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(16)
    VolunteerID: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    EventID?: string;
        
    @Field() 
    @MaxLength(3)
    LogDate: Date;
        
    @Field(() => Float, {description: `Number of hours worked on this task`}) 
    HoursWorked: number;
        
    @Field() 
    @MaxLength(1000)
    TaskDescription: string;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    ApprovedBy?: string;
        
    @Field(() => Boolean) 
    IsApproved: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Event?: string;
        
}

//****************************************************************************
// INPUT TYPE for Volunteer Logs
//****************************************************************************
@InputType()
export class CreatesamplenpoVolunteerLogInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    VolunteerID?: string;

    @Field({ nullable: true })
    EventID: string | null;

    @Field({ nullable: true })
    LogDate?: Date;

    @Field(() => Float, { nullable: true })
    HoursWorked?: number;

    @Field({ nullable: true })
    TaskDescription?: string;

    @Field({ nullable: true })
    ApprovedBy: string | null;

    @Field(() => Boolean, { nullable: true })
    IsApproved?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Volunteer Logs
//****************************************************************************
@InputType()
export class UpdatesamplenpoVolunteerLogInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    VolunteerID?: string;

    @Field({ nullable: true })
    EventID?: string | null;

    @Field({ nullable: true })
    LogDate?: Date;

    @Field(() => Float, { nullable: true })
    HoursWorked?: number;

    @Field({ nullable: true })
    TaskDescription?: string;

    @Field({ nullable: true })
    ApprovedBy?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsApproved?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Volunteer Logs
//****************************************************************************
@ObjectType()
export class RunsamplenpoVolunteerLogViewResult {
    @Field(() => [samplenpoVolunteerLog_])
    Results: samplenpoVolunteerLog_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoVolunteerLog_)
export class samplenpoVolunteerLogResolver extends ResolverBase {
    @Query(() => RunsamplenpoVolunteerLogViewResult)
    async RunsamplenpoVolunteerLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoVolunteerLogViewResult)
    async RunsamplenpoVolunteerLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoVolunteerLogViewResult)
    async RunsamplenpoVolunteerLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Volunteer Logs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoVolunteerLog_, { nullable: true })
    async samplenpoVolunteerLog(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoVolunteerLog_ | null> {
        this.CheckUserReadPermissions('Volunteer Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwVolunteerLogs] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Volunteer Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Volunteer Logs', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplenpoVolunteerLog_)
    async CreatesamplenpoVolunteerLog(
        @Arg('input', () => CreatesamplenpoVolunteerLogInput) input: CreatesamplenpoVolunteerLogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Volunteer Logs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoVolunteerLog_)
    async UpdatesamplenpoVolunteerLog(
        @Arg('input', () => UpdatesamplenpoVolunteerLogInput) input: UpdatesamplenpoVolunteerLogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Volunteer Logs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoVolunteerLog_)
    async DeletesamplenpoVolunteerLog(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Volunteer Logs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Volunteers
//****************************************************************************
@ObjectType({ description: `People who donate their time to the organization` })
export class samplenpoVolunteer_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(200)
    FirstName: string;
        
    @Field() 
    @MaxLength(200)
    LastName: string;
        
    @Field() 
    @MaxLength(510)
    Email: string;
        
    @Field() 
    @MaxLength(20)
    Phone: string;
        
    @Field({nullable: true}) 
    Skills?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    AvailableDays?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(8)
    JoinDate: Date;
        
    @Field(() => Float, {description: `Cumulative hours volunteered`}) 
    TotalHours: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplenpoVolunteerLog_])
    VolunteerLogs_VolunteerIDArray: samplenpoVolunteerLog_[]; // Link to VolunteerLogs
    
    @Field(() => [samplenpoEventAttendee_])
    EventAttendees_VolunteerIDArray: samplenpoEventAttendee_[]; // Link to EventAttendees
    
}

//****************************************************************************
// INPUT TYPE for Volunteers
//****************************************************************************
@InputType()
export class CreatesamplenpoVolunteerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Skills: string | null;

    @Field({ nullable: true })
    AvailableDays: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field(() => Float, { nullable: true })
    TotalHours?: number;
}
    

//****************************************************************************
// INPUT TYPE for Volunteers
//****************************************************************************
@InputType()
export class UpdatesamplenpoVolunteerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field({ nullable: true })
    Skills?: string | null;

    @Field({ nullable: true })
    AvailableDays?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    JoinDate?: Date;

    @Field(() => Float, { nullable: true })
    TotalHours?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Volunteers
//****************************************************************************
@ObjectType()
export class RunsamplenpoVolunteerViewResult {
    @Field(() => [samplenpoVolunteer_])
    Results: samplenpoVolunteer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(samplenpoVolunteer_)
export class samplenpoVolunteerResolver extends ResolverBase {
    @Query(() => RunsamplenpoVolunteerViewResult)
    async RunsamplenpoVolunteerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoVolunteerViewResult)
    async RunsamplenpoVolunteerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplenpoVolunteerViewResult)
    async RunsamplenpoVolunteerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Volunteers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplenpoVolunteer_, { nullable: true })
    async samplenpoVolunteer(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplenpoVolunteer_ | null> {
        this.CheckUserReadPermissions('Volunteers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwVolunteers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Volunteers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Volunteers', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplenpoVolunteerLog_])
    async VolunteerLogs_VolunteerIDArray(@Root() samplenpovolunteer_: samplenpoVolunteer_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Volunteer Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwVolunteerLogs] WHERE [VolunteerID]='${samplenpovolunteer_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Volunteer Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Volunteer Logs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplenpoEventAttendee_])
    async EventAttendees_VolunteerIDArray(@Root() samplenpovolunteer_: samplenpoVolunteer_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Event Attendees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_npo].[vwEventAttendees] WHERE [VolunteerID]='${samplenpovolunteer_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Event Attendees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Event Attendees', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplenpoVolunteer_)
    async CreatesamplenpoVolunteer(
        @Arg('input', () => CreatesamplenpoVolunteerInput) input: CreatesamplenpoVolunteerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Volunteers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplenpoVolunteer_)
    async UpdatesamplenpoVolunteer(
        @Arg('input', () => UpdatesamplenpoVolunteerInput) input: UpdatesamplenpoVolunteerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Volunteers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplenpoVolunteer_)
    async DeletesamplenpoVolunteer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Volunteers', key, options, provider, userPayload, pubSub);
    }
    
}