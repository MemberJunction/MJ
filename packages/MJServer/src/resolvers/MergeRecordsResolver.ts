import { LogError, Metadata } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';

@ObjectType()
export class EntityDependencyResult {
  @Field(() => String)
  EntityName: string; // required

  @Field(() => String)
  RelatedEntityName: string; // required

  @Field(() => String)
  FieldName: string; // required
}

@Resolver(EntityDependencyResult)
export class EntityDependencyResolver {
    @Query(() => [EntityDependencyResult])
    async GetEntityDependencies(
        @Arg('entityName', () => String) entityName: string,
        @Arg('recordId', () => Int) recordId: number,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        try {
        const md = new Metadata();
        return md.GetEntityDependencies(entityName);
        } 
        catch (err) {
            LogError(err);
            throw new Error(err.message);
        }
    }
 
}


@ObjectType()
export class RecordDependencyResult {
  @Field(() => String)
  EntityName: string; // required

  @Field(() => String)
  RelatedEntityName: string; // required

  @Field(() => String)
  FieldName: string; // required

  @Field(() => Int)
  RecordID: number;
}

@Resolver(RecordDependencyResult)
export class RecordDependencyResolver {
    @Query(() => [RecordDependencyResult])
    async GetRecordDependencies(
      @Arg('entityName', () => String) entityName: string,
      @Arg('recordId', () => Int) recordId: number,
      @Ctx() { dataSource, userPayload }: AppContext,
      @PubSub() pubSub: PubSubEngine
    ) {
        try {
            const md = new Metadata();
            const result = await md.GetRecordDependencies(entityName, recordId)    
            return result;
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }
}

@InputType()
class FieldMapping {
    @Field(() => String)
    FieldName: string;

    @Field(() => String)
    Value: string;
}

@ObjectType()
class FieldMappingOutput {
    @Field(() => String)
    FieldName: string;

    @Field(() => String)
    Value: string;
}

@InputType()
export class RecordMergeRequest {
    @Field(() => String)
    EntityName: string;

    @Field(() => String)
    SurvivingRecordPrimaryKeyValue: string;

    @Field(() => [Int])
    RecordsToMerge: number[];

    @Field(() => [FieldMapping], { nullable: true })
    FieldMap?: FieldMapping[];
}

@ObjectType()
export class RecordMergeRequestOutput {
    @Field(() => String)
    EntityName: string;

    @Field(() => Int)
    SurvivingRecordID: number;

    @Field(() => [Int])
    RecordsToMerge: number[];

    @Field(() => [FieldMappingOutput], { nullable: true })
    FieldMap?: FieldMappingOutput[];
}


@ObjectType()
export class RecordMergeDetailResult {
    @Field(() => Int)
    RecordID: number;

    @Field(() => Boolean)
    Success: boolean; 

    @Field(() => Int, {nullable: true})
    RecordMergeDeletionLogID?: number;

    @Field(() => String, {nullable: true})
    Message?: string;  
} 

@ObjectType()
export class RecordMergeResult {
  @Field(() => Boolean)
  Success: boolean; 

  @Field(() => String, {nullable: true})
  OverallStatus: string;  

  @Field(() => Int, {nullable: true})
  RecordMergeLogID: number;

  @Field(() => [RecordMergeDetailResult])
  RecordStatus: RecordMergeDetailResult[]; 

  @Field(() => RecordMergeRequestOutput)
  Request: RecordMergeRequestOutput; 
}

@Resolver(RecordMergeResult)
export class RecordMergeResolver {
    @Mutation(() => RecordMergeResult)
    async MergeRecords(
      @Arg('request', () => RecordMergeRequest) request: RecordMergeRequest,
      @Ctx() { dataSource, userPayload }: AppContext,
      @PubSub() pubSub: PubSubEngine
    ) {
        try {
            const md = new Metadata();
            const result = await md.MergeRecords(request, userPayload.userRecord);    
            return result;
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }
}


export default EntityDependencyResolver;