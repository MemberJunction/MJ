import { Metadata, KeyValuePair } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';
import { KeyValuePairInputType, KeyValuePairOutputType } from './MergeRecordsResolver';

@InputType()
export class EntityRecordNameInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => [KeyValuePairInputType])
  KeyValuePairs: KeyValuePair[];
}

@ObjectType()
export class EntityRecordNameResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => [KeyValuePairOutputType])
  KeyValuePairs: KeyValuePair[];

  @Field(() => String)
  EntityName: string;

  @Field(() => String, { nullable: true })
  RecordName?: string;
}

@Resolver(EntityRecordNameResult)
export class EntityRecordNameResolver {
  @Query(() => EntityRecordNameResult)
  async GetEntityRecordName(
    @Arg('EntityName', () => String) EntityName: string,
    @Arg('KeyValuePairs', () => [KeyValuePairInputType]) KeyValuePairs: KeyValuePair[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult> {
    const md = new Metadata();
    return await this.InnerGetEntityRecordName(md, EntityName, KeyValuePairs);
  }

  @Query(() => [EntityRecordNameResult])
  async GetEntityRecordNames(
    @Arg('info', () => [EntityRecordNameInput]) info: EntityRecordNameInput[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    const md = new Metadata();
    for (const i of info) {
      result.push(await this.InnerGetEntityRecordName(md, i.EntityName, i.KeyValuePairs));
    }
    return result;
  }

  async InnerGetEntityRecordName(md: Metadata, EntityName: string, KeyValuePairs: KeyValuePair[]): Promise<EntityRecordNameResult> {
    const e = md.Entities.find((e) => e.Name === EntityName);
    if (e) {
      const recordName = await md.GetEntityRecordName(e.Name, KeyValuePairs);
      if (recordName) 
        return { Success: true, Status: 'OK', KeyValuePairs: KeyValuePairs, RecordName: recordName, EntityName: EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${KeyValuePairs.map(pkv => pkv.FieldName + ':' + pkv.Value).join(',')} itself not found, could be an access issue if user doesn't have Row Level Access (RLS) if RLS is enabled for this entity`,
          KeyValuePairs: KeyValuePairs,
          EntityName: EntityName,
        };
    } 
    else 
      return { Success: false, Status: `Entity ${EntityName} not found`, KeyValuePairs: KeyValuePairs, EntityName: EntityName };
  }
}

export default EntityRecordNameResolver;
