import { Metadata, CompositeKey } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';
import { CompositeKeyInputType, CompositeKeyOutputType } from './PotentialDuplicateRecordResolver';

@InputType()
export class EntityRecordNameInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => CompositeKeyInputType)
  CompositeKey: CompositeKey;
}

@ObjectType()
export class EntityRecordNameResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => CompositeKeyOutputType)
  CompositeKey: CompositeKey;

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
    @Arg('CompositeKey', () => CompositeKeyInputType) CompositeKey: CompositeKey,
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult> {
    const md = new Metadata();
    return await this.InnerGetEntityRecordName(md, EntityName, CompositeKey);
  }

  @Query(() => [EntityRecordNameResult])
  async GetEntityRecordNames(
    @Arg('info', () => [EntityRecordNameInput]) info: EntityRecordNameInput[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    const md = new Metadata();
    for (const i of info) {
      result.push(await this.InnerGetEntityRecordName(md, i.EntityName, i.CompositeKey));
    }
    return result;
  }

  async InnerGetEntityRecordName(md: Metadata, EntityName: string, CompositeKey: CompositeKey): Promise<EntityRecordNameResult> {
    const e = md.Entities.find((e) => e.Name === EntityName);
    if (e) {
      const recordName = await md.GetEntityRecordName(e.Name, CompositeKey);
      if (recordName) 
        return { Success: true, Status: 'OK', CompositeKey, RecordName: recordName, EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${CompositeKey.ToString()} itself not found, could be an access issue if user doesn't have Row Level Access (RLS) if RLS is enabled for this entity`,
          CompositeKey,
          EntityName
        };
    } 
    else 
      return { Success: false, Status: `Entity ${EntityName} not found`, CompositeKey, EntityName };
  }
}

export default EntityRecordNameResolver;
