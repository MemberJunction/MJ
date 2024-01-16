import { Metadata } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';

@InputType()
export class EntityRecordNameInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => String)
  RecordID: string;
}

@ObjectType()
export class EntityRecordNameResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => String)
  RecordID: string;

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
    @Arg('RecordID', () => String) RecordID: string,
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult> {
    const md = new Metadata();
    return await this.InnerGetEntityRecordName(md, EntityName, RecordID);
  }

  @Query(() => [EntityRecordNameResult])
  async GetEntityRecordNames(
    @Arg('info', () => [EntityRecordNameInput]) info: EntityRecordNameInput[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    const md = new Metadata();
    for (const i of info) {
      result.push(await this.InnerGetEntityRecordName(md, i.EntityName, i.RecordID));
    }
    return result;
  }

  async InnerGetEntityRecordName(md: Metadata, EntityName: string, RecordID: string): Promise<EntityRecordNameResult> {
    const e = md.Entities.find((e) => e.Name === EntityName);
    if (e) {
      const recordName = await md.GetEntityRecordName(e.Name, RecordID);
      if (recordName) return { Success: true, Status: 'OK', RecordID: RecordID, RecordName: recordName, EntityName: EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${RecordID} itself not found, could be an access issue if user doesn't have Row Level Access (RLS) if RLS is enabled for this entity`,
          RecordID: RecordID,
          EntityName: EntityName,
        };
    } else return { Success: false, Status: `Entity ${EntityName} not found`, RecordID: RecordID, EntityName: EntityName };
  }
}

export default EntityRecordNameResolver;
