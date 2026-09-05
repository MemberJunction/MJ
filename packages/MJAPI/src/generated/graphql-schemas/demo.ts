/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { demoActivityEntity, demoMemberEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType()
export class demoActivity_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    MemberID: string;
        
    @Field() 
    ActivityDate: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    ActivityType?: string;
        
    @Field(() => Float, {nullable: true}) 
    Amount?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Member?: string;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreatedemoActivityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field({ nullable: true })
    ActivityType: string | null;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class UpdatedemoActivityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberID?: string;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field({ nullable: true })
    ActivityType?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RundemoActivityViewResult {
    @Field(() => [demoActivity_])
    Results: demoActivity_[];

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

@Resolver(demoActivity_)
export class demoActivityResolver extends ResolverBase {
    @Query(() => RundemoActivityViewResult)
    async RundemoActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RundemoActivityViewResult)
    async RundemoActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RundemoActivityViewResult)
    async RundemoActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => demoActivity_, { nullable: true })
    async demoActivity(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<demoActivity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('demo', 'vwActivities')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => demoActivity_)
    async CreatedemoActivity(
        @Arg('input', () => CreatedemoActivityInput) input: CreatedemoActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => demoActivity_)
    async UpdatedemoActivity(
        @Arg('input', () => UpdatedemoActivityInput) input: UpdatedemoActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => demoActivity_)
    async DeletedemoActivity(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Members
//****************************************************************************
@ObjectType()
export class demoMember_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(20)
    MemberNumber: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    City?: string;
        
    @Field(() => Int, {nullable: true}) 
    MembershipTenureMonths?: number;
        
    @Field({nullable: true}) 
    JoinedAt?: Date;
        
    @Field({nullable: true}) 
    RenewalDecidedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Renewed?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
}

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class CreatedemoMemberInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    MemberNumber?: string;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field(() => Int, { nullable: true })
    MembershipTenureMonths: number | null;

    @Field({ nullable: true })
    JoinedAt: Date | null;

    @Field({ nullable: true })
    RenewalDecidedAt: Date | null;

    @Field({ nullable: true })
    Renewed: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Members
//****************************************************************************
@InputType()
export class UpdatedemoMemberInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    MemberNumber?: string;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field(() => Int, { nullable: true })
    MembershipTenureMonths?: number | null;

    @Field({ nullable: true })
    JoinedAt?: Date | null;

    @Field({ nullable: true })
    RenewalDecidedAt?: Date | null;

    @Field({ nullable: true })
    Renewed?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Members
//****************************************************************************
@ObjectType()
export class RundemoMemberViewResult {
    @Field(() => [demoMember_])
    Results: demoMember_[];

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

@Resolver(demoMember_)
export class demoMemberResolver extends ResolverBase {
    @Query(() => RundemoMemberViewResult)
    async RundemoMemberViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RundemoMemberViewResult)
    async RundemoMemberViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RundemoMemberViewResult)
    async RundemoMemberDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Members';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => demoMember_, { nullable: true })
    async demoMember(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<demoMember_ | null> {
        this.CheckUserReadPermissions('Members', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('demo', 'vwMembers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Members', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Members', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => demoMember_)
    async CreatedemoMember(
        @Arg('input', () => CreatedemoMemberInput) input: CreatedemoMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Members', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => demoMember_)
    async UpdatedemoMember(
        @Arg('input', () => UpdatedemoMemberInput) input: UpdatedemoMemberInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Members', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => demoMember_)
    async DeletedemoMember(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Members', key, options, provider, userPayload, pubSub);
    }
    
}