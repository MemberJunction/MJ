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
            GetReadOnlyProvider, GetReadWriteProvider } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { ymMembersEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Members
//****************************************************************************
@ObjectType()
export class ymMembers_ {
    @Field() 
    @MaxLength(450)
    ProfileID: string;
        
    @Field({nullable: true}) 
    FirstName?: string;
        
    @Field({nullable: true}) 
    LastName?: string;
        
    @Field({nullable: true}) 
    EmailAddr?: string;
        
    @Field({nullable: true}) 
    MemberTypeCode?: string;
        
    @Field({nullable: true}) 
    Status?: string;
        
    @Field({nullable: true}) 
    Organization?: string;
        
    @Field({nullable: true}) 
    Phone?: string;
        
    @Field({nullable: true}) 
    Address1?: string;
        
    @Field({nullable: true}) 
    Address2?: string;
        
    @Field({nullable: true}) 
    City?: string;
        
    @Field({nullable: true}) 
    State?: string;
        
    @Field({nullable: true}) 
    PostalCode?: string;
        
    @Field({nullable: true}) 
    Country?: string;
        
    @Field({nullable: true}) 
    Title?: string;
        
    @Field({nullable: true}) 
    JoinDate?: Date;
        
    @Field({nullable: true}) 
    RenewalDate?: Date;
        
    @Field({nullable: true}) 
    ExpirationDate?: Date;
        
    @Field({nullable: true}) 
    MemberSinceDate?: Date;
        
    @Field({nullable: true}) 
    WebsiteUrl?: string;
        
    @Field({description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field({nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class CreateymMembersInput {
    @Field({ nullable: true })
    ProfileID?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    EmailAddr: string | null;

    @Field({ nullable: true })
    MemberTypeCode: string | null;

    @Field({ nullable: true })
    Status: string | null;

    @Field({ nullable: true })
    Organization: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Address1: string | null;

    @Field({ nullable: true })
    Address2: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    Country: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    JoinDate: Date | null;

    @Field({ nullable: true })
    RenewalDate: Date | null;

    @Field({ nullable: true })
    ExpirationDate: Date | null;

    @Field({ nullable: true })
    MemberSinceDate: Date | null;

    @Field({ nullable: true })
    WebsiteUrl: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class UpdateymMembersInput {
    @Field()
    ProfileID: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    EmailAddr?: string | null;

    @Field({ nullable: true })
    MemberTypeCode?: string | null;

    @Field({ nullable: true })
    Status?: string | null;

    @Field({ nullable: true })
    Organization?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Address1?: string | null;

    @Field({ nullable: true })
    Address2?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    JoinDate?: Date | null;

    @Field({ nullable: true })
    RenewalDate?: Date | null;

    @Field({ nullable: true })
    ExpirationDate?: Date | null;

    @Field({ nullable: true })
    MemberSinceDate?: Date | null;

    @Field({ nullable: true })
    WebsiteUrl?: string | null;

    @Field({ nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field({ nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Members
//****************************************************************************
@ObjectType()
export class RunymMembersViewResult {
    @Field(() => [ymMembers_])
    Results: ymMembers_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ymMembers_)
export class ymMembersResolver extends ResolverBase {
    @Query(() => RunymMembersViewResult)
    async RunymMembersViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunymMembersViewResult)
    async RunymMembersViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunymMembersViewResult)
    async RunymMembersDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ymMembers_, { nullable: true })
    async ymMembers(@Arg('ProfileID', () => String) ProfileID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ymMembers_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('ym', 'vwMembers')} WHERE ${provider.QuoteIdentifier('ProfileID')}='${ProfileID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Members', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => ymMembers_)
    async CreateymMembers(
        @Arg('input', () => CreateymMembersInput) input: CreateymMembersInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ymMembers_)
    async UpdateymMembers(
        @Arg('input', () => UpdateymMembersInput) input: UpdateymMembersInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ymMembers_)
    async DeleteymMembers(@Arg('ProfileID', () => String) ProfileID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ProfileID', Value: ProfileID}]);
        return this.DeleteRecord('Members', key, options, provider, userPayload, pubSub);
    }
    
}