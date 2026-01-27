import { LogError, Metadata, CompositeKey } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { CompositeKeyInputType, CompositeKeyOutputType } from '../generic/KeyInputOutputTypes.js';
import { z } from 'zod';
import { GetReadOnlyProvider, GetReadWriteProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';

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
    @Ctx() { dataSource, userPayload, providers }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    try {
      const md = GetReadOnlyProvider(providers);
      return md.GetEntityDependencies(entityName);
    } catch (err) {
      LogError(err);
      const ctx = z.object({ message: z.string() }).catch(null).parse(err)?.message ?? JSON.stringify(err);
      
      throw new Error(ctx);
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

  @Field(() => CompositeKeyOutputType)
  CompositeKey: CompositeKey;
}

@Resolver(RecordDependencyResult)
export class RecordDependencyResolver {
  @Query(() => [RecordDependencyResult])
  async GetRecordDependencies(
    @Arg('entityName', () => String) entityName: string,
    @Arg('CompositeKey', () => CompositeKeyInputType) ckInput: CompositeKeyInputType,
    @Ctx() { dataSource, userPayload, providers }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    try {
      const md = GetReadOnlyProvider(providers);
      const ck = new CompositeKey(ckInput.KeyValuePairs);
      const result = await md.GetRecordDependencies(entityName, ck);
      
      // Map PrimaryKey to CompositeKey for GraphQL response
      return result.map(dep => ({
        EntityName: dep.EntityName,
        RelatedEntityName: dep.RelatedEntityName,
        FieldName: dep.FieldName,
        CompositeKey: dep.PrimaryKey // Map PrimaryKey to CompositeKey
      }));
    } catch (e) {
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

  @Field(() => CompositeKeyInputType)
  SurvivingRecordCompositeKey: CompositeKey;

  @Field(() => [CompositeKeyInputType])
  RecordsToMerge: CompositeKey[];

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
  @Field(() => CompositeKeyOutputType)
  CompositeKey: CompositeKeyOutputType;

  @Field(() => Boolean)
  Success: boolean;

  @Field(() => Int, { nullable: true })
  RecordMergeDeletionLogID?: number;

  @Field(() => String, { nullable: true })
  Message?: string;
}

@ObjectType()
export class RecordMergeResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  OverallStatus: string;

  @Field(() => Int, { nullable: true })
  RecordMergeLogID: number;

  @Field(() => [RecordMergeDetailResult])
  RecordStatus: RecordMergeDetailResult[];

  @Field(() => RecordMergeRequestOutput)
  Request: RecordMergeRequestOutput;
}

@Resolver(RecordMergeResult)
export class RecordMergeResolver extends ResolverBase {
  @Mutation(() => RecordMergeResult)
  async MergeRecords(
    @Arg('request', () => RecordMergeRequest) request: RecordMergeRequest,
    @Ctx() { dataSource, userPayload, providers }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    // Check API key scope authorization for entity merge operation
    await this.CheckAPIKeyScopeAuthorization('entity:merge', request.EntityName, userPayload);

    try {
      const md = GetReadWriteProvider(providers);
      const options = {};
      const result = await md.MergeRecords(request, userPayload.userRecord, options);
      return result;
    } catch (e) {
      LogError(e);
      throw e;
    }
  }
}

export default EntityDependencyResolver;
