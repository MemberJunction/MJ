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


import { ChannelMessageTypeEntity, ChannelMessageEntity, ChannelTypeEntity, ChannelEntity, MessageTypeEntity, MessageTypeModelRoleEntity, MessageTypeModelEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Channel Message Types
//****************************************************************************
@ObjectType()
export class ChannelMessageType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: 'Foreign key to Channels table; links to a specific channel'}) 
    @MaxLength(16)
    ChannelID: string;
        
    @Field({description: 'Foreign key to MessageType table; links to a specific message type'}) 
    @MaxLength(16)
    MessageTypeID: string;
        
    @Field(() => Boolean, {description: 'Indicates if this message type is the default for the linked channel'}) 
    IsDefault: boolean;
        
    @Field(() => Boolean, {description: 'Indicates if the message type is currently active for the linked channel'}) 
    IsActive: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    Channel: string;
        
    @Field() 
    @MaxLength(510)
    MessageType: string;
        
    @Field(() => [ChannelMessage_])
    ChannelMessages_ChannelMessageTypeIDArray: ChannelMessage_[]; // Link to ChannelMessages
    
}

//****************************************************************************
// INPUT TYPE for Channel Message Types
//****************************************************************************
@InputType()
export class CreateChannelMessageTypeInput {
    @Field()
    ChannelID: string;

    @Field()
    MessageTypeID: string;

    @Field(() => Boolean)
    IsDefault: boolean;

    @Field(() => Boolean)
    IsActive: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Channel Message Types
//****************************************************************************
@InputType()
export class UpdateChannelMessageTypeInput {
    @Field()
    ID: string;

    @Field()
    ChannelID: string;

    @Field()
    MessageTypeID: string;

    @Field(() => Boolean)
    IsDefault: boolean;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Message Types
//****************************************************************************
@ObjectType()
export class RunChannelMessageTypeViewResult {
    @Field(() => [ChannelMessageType_])
    Results: ChannelMessageType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ChannelMessageType_)
export class ChannelMessageTypeResolver extends ResolverBase {
    @Query(() => RunChannelMessageTypeViewResult)
    async RunChannelMessageTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelMessageTypeViewResult)
    async RunChannelMessageTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelMessageTypeViewResult)
    async RunChannelMessageTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Channel Message Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ChannelMessageType_, { nullable: true })
    async ChannelMessageType(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ChannelMessageType_ | null> {
        this.CheckUserReadPermissions('Channel Message Types', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannelMessageTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Channel Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Channel Message Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [ChannelMessage_])
    async ChannelMessages_ChannelMessageTypeIDArray(@Root() channelmessagetype_: ChannelMessageType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannelMessages] WHERE [ChannelMessageTypeID]='${channelmessagetype_.ID}' ` + this.getRowLevelSecurityWhereClause('Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Channel Messages', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ChannelMessageType_)
    async CreateChannelMessageType(
        @Arg('input', () => CreateChannelMessageTypeInput) input: CreateChannelMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Channel Message Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ChannelMessageType_)
    async UpdateChannelMessageType(
        @Arg('input', () => UpdateChannelMessageTypeInput) input: UpdateChannelMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Channel Message Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ChannelMessageType_)
    async DeleteChannelMessageType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Message Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Messages
//****************************************************************************
@ObjectType()
export class ChannelMessage_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: 'Link to ChannelMessageType table identifying the type and channel of the message'}) 
    @MaxLength(16)
    ChannelMessageTypeID: string;
        
    @Field({nullable: true, description: 'Identifier for the message as provided by the communication provider; not unique globally but is indexed'}) 
    ExternalSystemRecordID?: string;
        
    @Field({description: 'Timestamp when the message was received from the communication provider'}) 
    @MaxLength(8)
    ReceivedAt: Date;
        
    @Field({description: 'Content of the message received from the end user'}) 
    MessageContent: string;
        
    @Field({nullable: true, description: 'Content of the response sent back to the end user'}) 
    ResponseContent?: string;
        
    @Field({description: 'Current status of the message processing; constrained to specific values'}) 
    @MaxLength(510)
    Status: string;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Channel Messages
//****************************************************************************
@InputType()
export class CreateChannelMessageInput {
    @Field()
    ChannelMessageTypeID: string;

    @Field({ nullable: true })
    ExternalSystemRecordID?: string;

    @Field()
    ReceivedAt: Date;

    @Field()
    MessageContent: string;

    @Field({ nullable: true })
    ResponseContent?: string;

    @Field()
    Status: string;
}
    

//****************************************************************************
// INPUT TYPE for Channel Messages
//****************************************************************************
@InputType()
export class UpdateChannelMessageInput {
    @Field()
    ID: string;

    @Field()
    ChannelMessageTypeID: string;

    @Field({ nullable: true })
    ExternalSystemRecordID?: string;

    @Field()
    ReceivedAt: Date;

    @Field()
    MessageContent: string;

    @Field({ nullable: true })
    ResponseContent?: string;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Messages
//****************************************************************************
@ObjectType()
export class RunChannelMessageViewResult {
    @Field(() => [ChannelMessage_])
    Results: ChannelMessage_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ChannelMessage_)
export class ChannelMessageResolver extends ResolverBase {
    @Query(() => RunChannelMessageViewResult)
    async RunChannelMessageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelMessageViewResult)
    async RunChannelMessageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelMessageViewResult)
    async RunChannelMessageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Channel Messages';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ChannelMessage_, { nullable: true })
    async ChannelMessage(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ChannelMessage_ | null> {
        this.CheckUserReadPermissions('Channel Messages', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannelMessages] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Channel Messages', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Channel Messages', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ChannelMessage_)
    async CreateChannelMessage(
        @Arg('input', () => CreateChannelMessageInput) input: CreateChannelMessageInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Channel Messages', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ChannelMessage_)
    async UpdateChannelMessage(
        @Arg('input', () => UpdateChannelMessageInput) input: UpdateChannelMessageInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Channel Messages', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ChannelMessage_)
    async DeleteChannelMessage(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Messages', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channel Types
//****************************************************************************
@ObjectType()
export class ChannelType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: 'Name of the channel type'}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: 'Detailed description of the channel type'}) 
    Description?: string;
        
    @Field({description: 'Foreign key linking to the MJ Communication Provider table'}) 
    @MaxLength(16)
    CommunicationProviderID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    CommunicationProvider: string;
        
    @Field(() => [Channel_])
    Channels_ChannelTypeIDArray: Channel_[]; // Link to Channels
    
}

//****************************************************************************
// INPUT TYPE for Channel Types
//****************************************************************************
@InputType()
export class CreateChannelTypeInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    CommunicationProviderID: string;
}
    

//****************************************************************************
// INPUT TYPE for Channel Types
//****************************************************************************
@InputType()
export class UpdateChannelTypeInput {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    CommunicationProviderID: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channel Types
//****************************************************************************
@ObjectType()
export class RunChannelTypeViewResult {
    @Field(() => [ChannelType_])
    Results: ChannelType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ChannelType_)
export class ChannelTypeResolver extends ResolverBase {
    @Query(() => RunChannelTypeViewResult)
    async RunChannelTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelTypeViewResult)
    async RunChannelTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelTypeViewResult)
    async RunChannelTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Channel Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ChannelType_, { nullable: true })
    async ChannelType(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ChannelType_ | null> {
        this.CheckUserReadPermissions('Channel Types', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannelTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Channel Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Channel Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [Channel_])
    async Channels_ChannelTypeIDArray(@Root() channeltype_: ChannelType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channels', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannels] WHERE [ChannelTypeID]='${channeltype_.ID}' ` + this.getRowLevelSecurityWhereClause('Channels', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Channels', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ChannelType_)
    async CreateChannelType(
        @Arg('input', () => CreateChannelTypeInput) input: CreateChannelTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Channel Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ChannelType_)
    async UpdateChannelType(
        @Arg('input', () => UpdateChannelTypeInput) input: UpdateChannelTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Channel Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ChannelType_)
    async DeleteChannelType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channel Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Channels
//****************************************************************************
@ObjectType()
export class Channel_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: 'Name of the channel'}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: 'Detailed description of the channel'}) 
    Description?: string;
        
    @Field({nullable: true, description: 'Account identifier, typically an email address, unique for each channel'}) 
    AccountID?: string;
        
    @Field({description: 'ID of the Channel Type reference'}) 
    @MaxLength(16)
    ChannelTypeID: string;
        
    @Field(() => Boolean, {description: 'Indicates whether the channel is currently active'}) 
    IsActive: boolean;
        
    @Field(() => Int, {nullable: true, description: 'Interval in minutes to check the channel'}) 
    CheckFrequency?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(510)
    ChannelType: string;
        
    @Field(() => [ChannelMessageType_])
    ChannelMessageTypes_ChannelIDArray: ChannelMessageType_[]; // Link to ChannelMessageTypes
    
}

//****************************************************************************
// INPUT TYPE for Channels
//****************************************************************************
@InputType()
export class CreateChannelInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    AccountID?: string;

    @Field()
    ChannelTypeID: string;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => Int, { nullable: true })
    CheckFrequency?: number;
}
    

//****************************************************************************
// INPUT TYPE for Channels
//****************************************************************************
@InputType()
export class UpdateChannelInput {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    AccountID?: string;

    @Field()
    ChannelTypeID: string;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => Int, { nullable: true })
    CheckFrequency?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Channels
//****************************************************************************
@ObjectType()
export class RunChannelViewResult {
    @Field(() => [Channel_])
    Results: Channel_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Channel_)
export class ChannelResolver extends ResolverBase {
    @Query(() => RunChannelViewResult)
    async RunChannelViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelViewResult)
    async RunChannelViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunChannelViewResult)
    async RunChannelDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Channels';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Channel_, { nullable: true })
    async Channel(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Channel_ | null> {
        this.CheckUserReadPermissions('Channels', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannels] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Channels', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Channels', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [ChannelMessageType_])
    async ChannelMessageTypes_ChannelIDArray(@Root() channel_: Channel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Message Types', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannelMessageTypes] WHERE [ChannelID]='${channel_.ID}' ` + this.getRowLevelSecurityWhereClause('Channel Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Channel Message Types', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Channel_)
    async CreateChannel(
        @Arg('input', () => CreateChannelInput) input: CreateChannelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Channels', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Channel_)
    async UpdateChannel(
        @Arg('input', () => UpdateChannelInput) input: UpdateChannelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Channels', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Channel_)
    async DeleteChannel(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Channels', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Message Types
//****************************************************************************
@ObjectType()
export class MessageType_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: 'Name of the message type'}) 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true, description: 'Detailed human-readable description of the message type'}) 
    Description?: string;
        
    @Field({description: 'A prompt element for AI to use in determining a message match'}) 
    PromptDescription: string;
        
    @Field({nullable: true, description: 'Examples of messages for this type, used in AI routing logic'}) 
    Examples?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [MessageTypeModel_])
    MessageTypeModels_MessageTypeIDArray: MessageTypeModel_[]; // Link to MessageTypeModels
    
    @Field(() => [ChannelMessageType_])
    ChannelMessageTypes_MessageTypeIDArray: ChannelMessageType_[]; // Link to ChannelMessageTypes
    
}

//****************************************************************************
// INPUT TYPE for Message Types
//****************************************************************************
@InputType()
export class CreateMessageTypeInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    PromptDescription: string;

    @Field({ nullable: true })
    Examples?: string;
}
    

//****************************************************************************
// INPUT TYPE for Message Types
//****************************************************************************
@InputType()
export class UpdateMessageTypeInput {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    PromptDescription: string;

    @Field({ nullable: true })
    Examples?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Message Types
//****************************************************************************
@ObjectType()
export class RunMessageTypeViewResult {
    @Field(() => [MessageType_])
    Results: MessageType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(MessageType_)
export class MessageTypeResolver extends ResolverBase {
    @Query(() => RunMessageTypeViewResult)
    async RunMessageTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMessageTypeViewResult)
    async RunMessageTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMessageTypeViewResult)
    async RunMessageTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Message Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => MessageType_, { nullable: true })
    async MessageType(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<MessageType_ | null> {
        this.CheckUserReadPermissions('Message Types', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwMessageTypes] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Message Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [MessageTypeModel_])
    async MessageTypeModels_MessageTypeIDArray(@Root() messagetype_: MessageType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Message Type Models', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwMessageTypeModels] WHERE [MessageTypeID]='${messagetype_.ID}' ` + this.getRowLevelSecurityWhereClause('Message Type Models', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Message Type Models', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [ChannelMessageType_])
    async ChannelMessageTypes_MessageTypeIDArray(@Root() messagetype_: MessageType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Channel Message Types', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwChannelMessageTypes] WHERE [MessageTypeID]='${messagetype_.ID}' ` + this.getRowLevelSecurityWhereClause('Channel Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Channel Message Types', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => MessageType_)
    async CreateMessageType(
        @Arg('input', () => CreateMessageTypeInput) input: CreateMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Message Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => MessageType_)
    async UpdateMessageType(
        @Arg('input', () => UpdateMessageTypeInput) input: UpdateMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Message Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => MessageType_)
    async DeleteMessageType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Message Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Message Type Model Roles
//****************************************************************************
@ObjectType()
export class MessageTypeModelRole_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field() 
    @MaxLength(510)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [MessageTypeModel_])
    MessageTypeModels_RoleIDArray: MessageTypeModel_[]; // Link to MessageTypeModels
    
}

//****************************************************************************
// INPUT TYPE for Message Type Model Roles
//****************************************************************************
@InputType()
export class CreateMessageTypeModelRoleInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;
}
    

//****************************************************************************
// INPUT TYPE for Message Type Model Roles
//****************************************************************************
@InputType()
export class UpdateMessageTypeModelRoleInput {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Message Type Model Roles
//****************************************************************************
@ObjectType()
export class RunMessageTypeModelRoleViewResult {
    @Field(() => [MessageTypeModelRole_])
    Results: MessageTypeModelRole_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(MessageTypeModelRole_)
export class MessageTypeModelRoleResolver extends ResolverBase {
    @Query(() => RunMessageTypeModelRoleViewResult)
    async RunMessageTypeModelRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMessageTypeModelRoleViewResult)
    async RunMessageTypeModelRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMessageTypeModelRoleViewResult)
    async RunMessageTypeModelRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Message Type Model Roles';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => MessageTypeModelRole_, { nullable: true })
    async MessageTypeModelRole(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<MessageTypeModelRole_ | null> {
        this.CheckUserReadPermissions('Message Type Model Roles', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwMessageTypeModelRoles] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Message Type Model Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Message Type Model Roles', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [MessageTypeModel_])
    async MessageTypeModels_RoleIDArray(@Root() messagetypemodelrole_: MessageTypeModelRole_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Message Type Models', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwMessageTypeModels] WHERE [RoleID]='${messagetypemodelrole_.ID}' ` + this.getRowLevelSecurityWhereClause('Message Type Models', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Message Type Models', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => MessageTypeModelRole_)
    async CreateMessageTypeModelRole(
        @Arg('input', () => CreateMessageTypeModelRoleInput) input: CreateMessageTypeModelRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Message Type Model Roles', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => MessageTypeModelRole_)
    async UpdateMessageTypeModelRole(
        @Arg('input', () => UpdateMessageTypeModelRoleInput) input: UpdateMessageTypeModelRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Message Type Model Roles', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => MessageTypeModelRole_)
    async DeleteMessageTypeModelRole(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Message Type Model Roles', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Message Type Models
//****************************************************************************
@ObjectType()
export class MessageTypeModel_ {
    @Field() 
    @MaxLength(16)
    ID: string;
        
    @Field({description: 'Name of the model relationship'}) 
    @MaxLength(510)
    Name: string;
        
    @Field(() => Int, {description: 'Order in which models are executed; must be 1 or greater'}) 
    Sequence: number;
        
    @Field({nullable: true, description: 'Description of the model relationship'}) 
    Description?: string;
        
    @Field({nullable: true, description: 'Foreign key linking to an AI model in __mj.AIModel table'}) 
    @MaxLength(16)
    AIModelID?: string;
        
    @Field({nullable: true, description: 'System prompt for interacting with the model for a specific message type'}) 
    SystemPrompt?: string;
        
    @Field() 
    @MaxLength(16)
    RoleID: string;
        
    @Field() 
    @MaxLength(16)
    MessageTypeID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    ForwardEmailList?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    ActionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    AIModel?: string;
        
    @Field() 
    @MaxLength(510)
    Role: string;
        
    @Field() 
    @MaxLength(510)
    MessageType: string;
        
    @Field({nullable: true}) 
    @MaxLength(850)
    Action?: string;
        
}

//****************************************************************************
// INPUT TYPE for Message Type Models
//****************************************************************************
@InputType()
export class CreateMessageTypeModelInput {
    @Field()
    Name: string;

    @Field(() => Int)
    Sequence: number;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    AIModelID?: string;

    @Field({ nullable: true })
    SystemPrompt?: string;

    @Field()
    RoleID: string;

    @Field()
    MessageTypeID: string;

    @Field({ nullable: true })
    ForwardEmailList?: string;

    @Field({ nullable: true })
    ActionID?: string;
}
    

//****************************************************************************
// INPUT TYPE for Message Type Models
//****************************************************************************
@InputType()
export class UpdateMessageTypeModelInput {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field(() => Int)
    Sequence: number;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    AIModelID?: string;

    @Field({ nullable: true })
    SystemPrompt?: string;

    @Field()
    RoleID: string;

    @Field()
    MessageTypeID: string;

    @Field({ nullable: true })
    ForwardEmailList?: string;

    @Field({ nullable: true })
    ActionID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Message Type Models
//****************************************************************************
@ObjectType()
export class RunMessageTypeModelViewResult {
    @Field(() => [MessageTypeModel_])
    Results: MessageTypeModel_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(MessageTypeModel_)
export class MessageTypeModelResolver extends ResolverBase {
    @Query(() => RunMessageTypeModelViewResult)
    async RunMessageTypeModelViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMessageTypeModelViewResult)
    async RunMessageTypeModelViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunMessageTypeModelViewResult)
    async RunMessageTypeModelDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Message Type Models';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => MessageTypeModel_, { nullable: true })
    async MessageTypeModel(@Arg('ID', () => String) ID: string, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<MessageTypeModel_ | null> {
        this.CheckUserReadPermissions('Message Type Models', userPayload);
        const sSQL = `SELECT * FROM [MJ_ServiceAgent].[vwMessageTypeModels] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause('Message Type Models', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Message Type Models', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => MessageTypeModel_)
    async CreateMessageTypeModel(
        @Arg('input', () => CreateMessageTypeModelInput) input: CreateMessageTypeModelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Message Type Models', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => MessageTypeModel_)
    async UpdateMessageTypeModel(
        @Arg('input', () => UpdateMessageTypeModelInput) input: UpdateMessageTypeModelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Message Type Models', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => MessageTypeModel_)
    async DeleteMessageTypeModel(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Message Type Models', key, options, dataSource, userPayload, pubSub);
    }
    
}