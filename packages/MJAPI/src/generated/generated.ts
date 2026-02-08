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


import { vwCustomerOrderSummaryEntity, CustomerEntity, MeetingEntity, OrderEntity, ProductEntity, PublicationEntity, WebinarEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Customer Order Summaries
//****************************************************************************
@ObjectType()
export class AdvancedEntitiesvwCustomerOrderSummary_ {
    @Field() 
    @MaxLength(16)
    CustomerID: string;
        
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
    @MaxLength(400)
    Company?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    State?: string;
        
    @Field() 
    @MaxLength(200)
    Country: string;
        
    @Field() 
    @MaxLength(40)
    Tier: string;
        
    @Field() 
    @MaxLength(3)
    CustomerSince: Date;
        
    @Field(() => Int, {nullable: true}) 
    TotalOrders?: number;
        
    @Field(() => Float) 
    LifetimeSpend: number;
        
    @Field(() => Float) 
    AvgOrderValue: number;
        
    @Field(() => Float) 
    SmallestOrder: number;
        
    @Field(() => Float) 
    LargestOrder: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    FirstOrderDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    LastOrderDate?: Date;
        
    @Field(() => Int) 
    TotalItemsPurchased: number;
        
    @Field(() => Int, {nullable: true}) 
    CancelledOrders?: number;
        
    @Field(() => Int, {nullable: true}) 
    DeliveredOrders?: number;
        
    @Field(() => Int, {nullable: true}) 
    DaysSinceLastOrder?: number;
        
}
//****************************************************************************
// RESOLVER for Customer Order Summaries
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesvwCustomerOrderSummaryViewResult {
    @Field(() => [AdvancedEntitiesvwCustomerOrderSummary_])
    Results: AdvancedEntitiesvwCustomerOrderSummary_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesvwCustomerOrderSummary_)
export class AdvancedEntitiesvwCustomerOrderSummaryResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesvwCustomerOrderSummaryViewResult)
    async RunAdvancedEntitiesvwCustomerOrderSummaryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesvwCustomerOrderSummaryViewResult)
    async RunAdvancedEntitiesvwCustomerOrderSummaryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesvwCustomerOrderSummaryViewResult)
    async RunAdvancedEntitiesvwCustomerOrderSummaryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Customer Order Summaries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesvwCustomerOrderSummary_, { nullable: true })
    async AdvancedEntitiesvwCustomerOrderSummary(@Arg('CustomerID', () => String) CustomerID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesvwCustomerOrderSummary_ | null> {
        this.CheckUserReadPermissions('Customer Order Summaries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwCustomerOrderSummary] WHERE [CustomerID]='${CustomerID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Customer Order Summaries', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(provider, userPayload, 'Customer Order Summaries', CustomerID)
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Customer Order Summaries', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for Customers
//****************************************************************************
@ObjectType({ description: `Customer records for the virtual entity demo. Combined with Order data to produce the vwCustomerOrderSummary virtual entity.` })
export class AdvancedEntitiesCustomer_ {
    @Field({description: `Unique customer identifier.`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Customer first name.`}) 
    @MaxLength(200)
    FirstName: string;
        
    @Field({description: `Customer last name.`}) 
    @MaxLength(200)
    LastName: string;
        
    @Field({description: `Primary email address (unique).`}) 
    @MaxLength(510)
    Email: string;
        
    @Field({nullable: true, description: `Contact phone number.`}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true, description: `Company or organization name.`}) 
    @MaxLength(400)
    Company?: string;
        
    @Field({nullable: true, description: `City of the customer.`}) 
    @MaxLength(200)
    City?: string;
        
    @Field({nullable: true, description: `State or province.`}) 
    @MaxLength(100)
    State?: string;
        
    @Field({description: `Country (defaults to USA).`}) 
    @MaxLength(200)
    Country: string;
        
    @Field({description: `Date the customer account was created.`}) 
    @MaxLength(3)
    CustomerSince: Date;
        
    @Field({description: `Loyalty tier: Bronze, Silver, Gold, or Platinum.`}) 
    @MaxLength(40)
    Tier: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AdvancedEntitiesOrder_])
    Orders_CustomerIDArray: AdvancedEntitiesOrder_[]; // Link to Orders
    
}

//****************************************************************************
// INPUT TYPE for Customers
//****************************************************************************
@InputType()
export class CreateAdvancedEntitiesCustomerInput {
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
    Company: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Country?: string;

    @Field({ nullable: true })
    CustomerSince?: Date;

    @Field({ nullable: true })
    Tier?: string;
}
    

//****************************************************************************
// INPUT TYPE for Customers
//****************************************************************************
@InputType()
export class UpdateAdvancedEntitiesCustomerInput {
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
    Company?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Country?: string;

    @Field({ nullable: true })
    CustomerSince?: Date;

    @Field({ nullable: true })
    Tier?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Customers
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesCustomerViewResult {
    @Field(() => [AdvancedEntitiesCustomer_])
    Results: AdvancedEntitiesCustomer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesCustomer_)
export class AdvancedEntitiesCustomerResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesCustomerViewResult)
    async RunAdvancedEntitiesCustomerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesCustomerViewResult)
    async RunAdvancedEntitiesCustomerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesCustomerViewResult)
    async RunAdvancedEntitiesCustomerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Customers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesCustomer_, { nullable: true })
    async AdvancedEntitiesCustomer(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesCustomer_ | null> {
        this.CheckUserReadPermissions('Customers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwCustomers] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Customers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Customers', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AdvancedEntitiesOrder_])
    async Orders_CustomerIDArray(@Root() advancedentitiescustomer_: AdvancedEntitiesCustomer_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwOrders] WHERE [CustomerID]='${advancedentitiescustomer_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AdvancedEntitiesCustomer_)
    async CreateAdvancedEntitiesCustomer(
        @Arg('input', () => CreateAdvancedEntitiesCustomerInput) input: CreateAdvancedEntitiesCustomerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Customers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AdvancedEntitiesCustomer_)
    async UpdateAdvancedEntitiesCustomer(
        @Arg('input', () => UpdateAdvancedEntitiesCustomerInput) input: UpdateAdvancedEntitiesCustomerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Customers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AdvancedEntitiesCustomer_)
    async DeleteAdvancedEntitiesCustomer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Customers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Meetings
//****************************************************************************
@ObjectType({ description: `IS-A child of Product. Represents a meeting-type product (conference session, workshop, training). Shares the same primary key as its parent Product record.` })
export class AdvancedEntitiesMeeting_ {
    @Field({description: `Shared primary key with Product. This is the same UUID as the parent Product.ID.`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `When the meeting begins.`}) 
    @MaxLength(8)
    StartTime: Date;
        
    @Field({description: `When the meeting ends.`}) 
    @MaxLength(8)
    EndTime: Date;
        
    @Field({nullable: true, description: `Physical address or virtual meeting room URL.`}) 
    @MaxLength(1000)
    Location?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum number of attendees allowed.`}) 
    MaxAttendees?: number;
        
    @Field({nullable: true, description: `Platform used for virtual meetings (e.g., Zoom, Microsoft Teams, Google Meet).`}) 
    @MaxLength(200)
    MeetingPlatform?: string;
        
    @Field({description: `Name of the person organizing this meeting.`}) 
    @MaxLength(400)
    OrganizerName: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Float) 
    Price: number;
        
    @Field() 
    @MaxLength(100)
    SKU: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field(() => [AdvancedEntitiesWebinar_])
    Webinars_IDArray: AdvancedEntitiesWebinar_[]; // Link to Webinars
    
}

//****************************************************************************
// INPUT TYPE for Meetings
//****************************************************************************
@InputType()
export class CreateAdvancedEntitiesMeetingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Location: string | null;

    @Field(() => Int, { nullable: true })
    MaxAttendees: number | null;

    @Field({ nullable: true })
    MeetingPlatform: string | null;

    @Field({ nullable: true })
    OrganizerName?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Meetings
//****************************************************************************
@InputType()
export class UpdateAdvancedEntitiesMeetingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Location?: string | null;

    @Field(() => Int, { nullable: true })
    MaxAttendees?: number | null;

    @Field({ nullable: true })
    MeetingPlatform?: string | null;

    @Field({ nullable: true })
    OrganizerName?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Meetings
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesMeetingViewResult {
    @Field(() => [AdvancedEntitiesMeeting_])
    Results: AdvancedEntitiesMeeting_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesMeeting_)
export class AdvancedEntitiesMeetingResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesMeetingViewResult)
    async RunAdvancedEntitiesMeetingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesMeetingViewResult)
    async RunAdvancedEntitiesMeetingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesMeetingViewResult)
    async RunAdvancedEntitiesMeetingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Meetings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesMeeting_, { nullable: true })
    async AdvancedEntitiesMeeting(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesMeeting_ | null> {
        this.CheckUserReadPermissions('Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwMeetings] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Meetings', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AdvancedEntitiesWebinar_])
    async Webinars_IDArray(@Root() advancedentitiesmeeting_: AdvancedEntitiesMeeting_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Webinars', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwWebinars] WHERE [ID]='${advancedentitiesmeeting_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Webinars', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Webinars', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AdvancedEntitiesMeeting_)
    async CreateAdvancedEntitiesMeeting(
        @Arg('input', () => CreateAdvancedEntitiesMeetingInput) input: CreateAdvancedEntitiesMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Meetings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AdvancedEntitiesMeeting_)
    async UpdateAdvancedEntitiesMeeting(
        @Arg('input', () => UpdateAdvancedEntitiesMeetingInput) input: UpdateAdvancedEntitiesMeetingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Meetings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AdvancedEntitiesMeeting_)
    async DeleteAdvancedEntitiesMeeting(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Meetings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Orders
//****************************************************************************
@ObjectType({ description: `Customer orders for the virtual entity demo. Aggregated with Customer data in vwCustomerOrderSummary.` })
export class AdvancedEntitiesOrder_ {
    @Field({description: `Unique order identifier.`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Foreign key to Customer. Each order belongs to exactly one customer.`}) 
    @MaxLength(16)
    CustomerID: string;
        
    @Field({description: `Date and time the order was placed.`}) 
    @MaxLength(8)
    OrderDate: Date;
        
    @Field(() => Float, {description: `Total monetary value of the order in USD.`}) 
    TotalAmount: number;
        
    @Field({description: `Order fulfillment status: Pending, Processing, Shipped, Delivered, or Cancelled.`}) 
    @MaxLength(40)
    Status: string;
        
    @Field(() => Int, {description: `Number of items in this order.`}) 
    ItemCount: number;
        
    @Field({nullable: true, description: `Delivery address for physical shipments.`}) 
    @MaxLength(1000)
    ShippingAddress?: string;
        
    @Field({nullable: true, description: `Optional notes or special instructions.`}) 
    Notes?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Orders
//****************************************************************************
@InputType()
export class CreateAdvancedEntitiesOrderInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CustomerID?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    ItemCount?: number;

    @Field({ nullable: true })
    ShippingAddress: string | null;

    @Field({ nullable: true })
    Notes: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Orders
//****************************************************************************
@InputType()
export class UpdateAdvancedEntitiesOrderInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CustomerID?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    ItemCount?: number;

    @Field({ nullable: true })
    ShippingAddress?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Orders
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesOrderViewResult {
    @Field(() => [AdvancedEntitiesOrder_])
    Results: AdvancedEntitiesOrder_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesOrder_)
export class AdvancedEntitiesOrderResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesOrderViewResult)
    async RunAdvancedEntitiesOrderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesOrderViewResult)
    async RunAdvancedEntitiesOrderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesOrderViewResult)
    async RunAdvancedEntitiesOrderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Orders';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesOrder_, { nullable: true })
    async AdvancedEntitiesOrder(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesOrder_ | null> {
        this.CheckUserReadPermissions('Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwOrders] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Orders', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AdvancedEntitiesOrder_)
    async CreateAdvancedEntitiesOrder(
        @Arg('input', () => CreateAdvancedEntitiesOrderInput) input: CreateAdvancedEntitiesOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Orders', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AdvancedEntitiesOrder_)
    async UpdateAdvancedEntitiesOrder(
        @Arg('input', () => UpdateAdvancedEntitiesOrderInput) input: UpdateAdvancedEntitiesOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Orders', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AdvancedEntitiesOrder_)
    async DeleteAdvancedEntitiesOrder(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Orders', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products
//****************************************************************************
@ObjectType({ description: `Root entity in the IS-A hierarchy. All Meetings, Webinars, and Publications are also Products. Demonstrates Table-Per-Type inheritance with shared primary keys.` })
export class AdvancedEntitiesProduct_ {
    @Field({description: `Unique identifier for this product. Shared across the IS-A chain (same UUID in Product, Meeting/Publication, and Webinar tables).`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the product.`}) 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of the product.`}) 
    Description?: string;
        
    @Field(() => Float, {description: `Price in USD.`}) 
    Price: number;
        
    @Field({description: `Stock Keeping Unit. Unique identifier for inventory and catalog purposes.`}) 
    @MaxLength(100)
    SKU: string;
        
    @Field({nullable: true, description: `Product category for grouping and filtering.`}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => Boolean, {description: `Whether this product is currently active and available.`}) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [AdvancedEntitiesMeeting_])
    Meetings_IDArray: AdvancedEntitiesMeeting_[]; // Link to Meetings
    
    @Field(() => [AdvancedEntitiesPublication_])
    Publications_IDArray: AdvancedEntitiesPublication_[]; // Link to Publications
    
}

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class CreateAdvancedEntitiesProductInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class UpdateAdvancedEntitiesProductInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesProductViewResult {
    @Field(() => [AdvancedEntitiesProduct_])
    Results: AdvancedEntitiesProduct_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesProduct_)
export class AdvancedEntitiesProductResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesProductViewResult)
    async RunAdvancedEntitiesProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesProductViewResult)
    async RunAdvancedEntitiesProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesProductViewResult)
    async RunAdvancedEntitiesProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesProduct_, { nullable: true })
    async AdvancedEntitiesProduct(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesProduct_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwProducts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [AdvancedEntitiesMeeting_])
    async Meetings_IDArray(@Root() advancedentitiesproduct_: AdvancedEntitiesProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Meetings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwMeetings] WHERE [ID]='${advancedentitiesproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Meetings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Meetings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [AdvancedEntitiesPublication_])
    async Publications_IDArray(@Root() advancedentitiesproduct_: AdvancedEntitiesProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Publications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwPublications] WHERE [ID]='${advancedentitiesproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Publications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Publications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => AdvancedEntitiesProduct_)
    async CreateAdvancedEntitiesProduct(
        @Arg('input', () => CreateAdvancedEntitiesProductInput) input: CreateAdvancedEntitiesProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AdvancedEntitiesProduct_)
    async UpdateAdvancedEntitiesProduct(
        @Arg('input', () => UpdateAdvancedEntitiesProductInput) input: UpdateAdvancedEntitiesProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AdvancedEntitiesProduct_)
    async DeleteAdvancedEntitiesProduct(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Publications
//****************************************************************************
@ObjectType({ description: `IS-A child of Product (sibling to Meeting). Represents a publication-type product such as a book, eBook, or guide. Shares the same primary key as its parent Product record. Disjoint from Meeting: a Product cannot be both a Meeting and a Publication.` })
export class AdvancedEntitiesPublication_ {
    @Field({description: `Shared primary key with Product. This is the same UUID as the parent Product.ID.`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({nullable: true, description: `International Standard Book Number.`}) 
    @MaxLength(40)
    ISBN?: string;
        
    @Field({description: `Date the publication was released.`}) 
    @MaxLength(3)
    PublishDate: Date;
        
    @Field({description: `Name of the publishing company.`}) 
    @MaxLength(400)
    Publisher: string;
        
    @Field({description: `Publication format: eBook, Print, AudioBook, or PDF.`}) 
    @MaxLength(100)
    Format: string;
        
    @Field(() => Int, {nullable: true, description: `Total number of pages (for Print and PDF formats).`}) 
    PageCount?: number;
        
    @Field({description: `Author of the publication.`}) 
    @MaxLength(400)
    Author: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Float) 
    Price: number;
        
    @Field() 
    @MaxLength(100)
    SKU: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
}

//****************************************************************************
// INPUT TYPE for Publications
//****************************************************************************
@InputType()
export class CreateAdvancedEntitiesPublicationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ISBN: string | null;

    @Field({ nullable: true })
    PublishDate?: Date;

    @Field({ nullable: true })
    Publisher?: string;

    @Field({ nullable: true })
    Format?: string;

    @Field(() => Int, { nullable: true })
    PageCount: number | null;

    @Field({ nullable: true })
    Author?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Publications
//****************************************************************************
@InputType()
export class UpdateAdvancedEntitiesPublicationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ISBN?: string | null;

    @Field({ nullable: true })
    PublishDate?: Date;

    @Field({ nullable: true })
    Publisher?: string;

    @Field({ nullable: true })
    Format?: string;

    @Field(() => Int, { nullable: true })
    PageCount?: number | null;

    @Field({ nullable: true })
    Author?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Publications
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesPublicationViewResult {
    @Field(() => [AdvancedEntitiesPublication_])
    Results: AdvancedEntitiesPublication_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesPublication_)
export class AdvancedEntitiesPublicationResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesPublicationViewResult)
    async RunAdvancedEntitiesPublicationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesPublicationViewResult)
    async RunAdvancedEntitiesPublicationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesPublicationViewResult)
    async RunAdvancedEntitiesPublicationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Publications';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesPublication_, { nullable: true })
    async AdvancedEntitiesPublication(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesPublication_ | null> {
        this.CheckUserReadPermissions('Publications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwPublications] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Publications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Publications', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AdvancedEntitiesPublication_)
    async CreateAdvancedEntitiesPublication(
        @Arg('input', () => CreateAdvancedEntitiesPublicationInput) input: CreateAdvancedEntitiesPublicationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Publications', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AdvancedEntitiesPublication_)
    async UpdateAdvancedEntitiesPublication(
        @Arg('input', () => UpdateAdvancedEntitiesPublicationInput) input: UpdateAdvancedEntitiesPublicationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Publications', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AdvancedEntitiesPublication_)
    async DeleteAdvancedEntitiesPublication(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Publications', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Webinars
//****************************************************************************
@ObjectType({ description: `IS-A grandchild: Webinar IS-A Meeting IS-A Product. Represents a webinar-type meeting with streaming capabilities. Shares the same primary key as its parent Meeting and grandparent Product.` })
export class AdvancedEntitiesWebinar_ {
    @Field({description: `Shared primary key with Meeting and Product. Same UUID across all three tables.`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({nullable: true, description: `URL for the live stream.`}) 
    @MaxLength(2000)
    StreamingURL?: string;
        
    @Field(() => Boolean, {description: `Whether this webinar will be recorded for later viewing.`}) 
    IsRecorded: boolean;
        
    @Field({description: `The webinar hosting platform (e.g., Zoom Webinars, GoToWebinar, Webex Events).`}) 
    @MaxLength(200)
    WebinarProvider: string;
        
    @Field({nullable: true, description: `URL where attendees can register for the webinar.`}) 
    @MaxLength(2000)
    RegistrationURL?: string;
        
    @Field(() => Int, {nullable: true, description: `Expected number of attendees for planning purposes.`}) 
    ExpectedAttendees?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    StartTime: Date;
        
    @Field() 
    @MaxLength(8)
    EndTime: Date;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    Location?: string;
        
    @Field(() => Int, {nullable: true}) 
    MaxAttendees?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    MeetingPlatform?: string;
        
    @Field() 
    @MaxLength(400)
    OrganizerName: string;
        
    @Field() 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Float) 
    Price: number;
        
    @Field() 
    @MaxLength(100)
    SKU: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
}

//****************************************************************************
// INPUT TYPE for Webinars
//****************************************************************************
@InputType()
export class CreateAdvancedEntitiesWebinarInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    StreamingURL: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRecorded?: boolean;

    @Field({ nullable: true })
    WebinarProvider?: string;

    @Field({ nullable: true })
    RegistrationURL: string | null;

    @Field(() => Int, { nullable: true })
    ExpectedAttendees: number | null;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Location: string | null;

    @Field(() => Int, { nullable: true })
    MaxAttendees: number | null;

    @Field({ nullable: true })
    MeetingPlatform: string | null;

    @Field({ nullable: true })
    OrganizerName?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Webinars
//****************************************************************************
@InputType()
export class UpdateAdvancedEntitiesWebinarInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    StreamingURL?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRecorded?: boolean;

    @Field({ nullable: true })
    WebinarProvider?: string;

    @Field({ nullable: true })
    RegistrationURL?: string | null;

    @Field(() => Int, { nullable: true })
    ExpectedAttendees?: number | null;

    @Field({ nullable: true })
    StartTime?: Date;

    @Field({ nullable: true })
    EndTime?: Date;

    @Field({ nullable: true })
    Location?: string | null;

    @Field(() => Int, { nullable: true })
    MaxAttendees?: number | null;

    @Field({ nullable: true })
    MeetingPlatform?: string | null;

    @Field({ nullable: true })
    OrganizerName?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    Price?: number;

    @Field({ nullable: true })
    SKU?: string;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Webinars
//****************************************************************************
@ObjectType()
export class RunAdvancedEntitiesWebinarViewResult {
    @Field(() => [AdvancedEntitiesWebinar_])
    Results: AdvancedEntitiesWebinar_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(AdvancedEntitiesWebinar_)
export class AdvancedEntitiesWebinarResolver extends ResolverBase {
    @Query(() => RunAdvancedEntitiesWebinarViewResult)
    async RunAdvancedEntitiesWebinarViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesWebinarViewResult)
    async RunAdvancedEntitiesWebinarViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAdvancedEntitiesWebinarViewResult)
    async RunAdvancedEntitiesWebinarDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Webinars';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => AdvancedEntitiesWebinar_, { nullable: true })
    async AdvancedEntitiesWebinar(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AdvancedEntitiesWebinar_ | null> {
        this.CheckUserReadPermissions('Webinars', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [AdvancedEntities].[vwWebinars] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Webinars', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Webinars', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => AdvancedEntitiesWebinar_)
    async CreateAdvancedEntitiesWebinar(
        @Arg('input', () => CreateAdvancedEntitiesWebinarInput) input: CreateAdvancedEntitiesWebinarInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Webinars', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => AdvancedEntitiesWebinar_)
    async UpdateAdvancedEntitiesWebinar(
        @Arg('input', () => UpdateAdvancedEntitiesWebinarInput) input: UpdateAdvancedEntitiesWebinarInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Webinars', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => AdvancedEntitiesWebinar_)
    async DeleteAdvancedEntitiesWebinar(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Webinars', key, options, provider, userPayload, pubSub);
    }
    
}