import { Metadata, PrimaryKeyValue } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';
import { PrimaryKeyValueInputType, PrimaryKeyValueOutputType } from './MergeRecordsResolver';

@InputType()
export class EntityRecordNameInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValue[];
}

@ObjectType()
export class EntityRecordNameResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => [PrimaryKeyValueOutputType])
  PrimaryKeyValues: PrimaryKeyValue[];

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
    @Arg('PrimaryKeyValues', () => [PrimaryKeyValueInputType]) PrimaryKeyValues: PrimaryKeyValue[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult> {
    const md = new Metadata();
    return await this.InnerGetEntityRecordName(md, EntityName, PrimaryKeyValues);
  }

  @Query(() => [EntityRecordNameResult])
  async GetEntityRecordNames(
    @Arg('info', () => [EntityRecordNameInput]) info: EntityRecordNameInput[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    const md = new Metadata();
    for (const i of info) {
      result.push(await this.InnerGetEntityRecordName(md, i.EntityName, i.PrimaryKeyValues));
    }
    return result;
  }

  async InnerGetEntityRecordName(md: Metadata, EntityName: string, primaryKeyValues: PrimaryKeyValue[]): Promise<EntityRecordNameResult> {
    const e = md.Entities.find((e) => e.Name === EntityName);
    if (e) {
      const recordName = await md.GetEntityRecordName(e.Name, primaryKeyValues);
      if (recordName) 
        return { Success: true, Status: 'OK', PrimaryKeyValues: primaryKeyValues, RecordName: recordName, EntityName: EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${primaryKeyValues.map(pkv => pkv.FieldName + ':' + pkv.Value).join(',')} itself not found, could be an access issue if user doesn't have Row Level Access (RLS) if RLS is enabled for this entity`,
          PrimaryKeyValues: primaryKeyValues,
          EntityName: EntityName,
        };
    } 
    else 
      return { Success: false, Status: `Entity ${EntityName} not found`, PrimaryKeyValues: primaryKeyValues, EntityName: EntityName };
  }
}

export default EntityRecordNameResolver;
