import { CompositeKey, DatabaseProviderBase } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { CompositeKeyInputType, CompositeKeyOutputType } from '../generic/KeyInputOutputTypes.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';

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

/**
 * Resolves a record's display NAME from its primary key — the lookup behind every foreign-key
 * link, breadcrumb and picker label in the UI.
 *
 * Entity-level read permission is checked here ({@link ResolverBase.CheckUserReadPermissions}).
 * Field- and row-level security are applied by the provider's lookup, for the acting user passed
 * to it: when any field the name is built from is withheld, it answers with no name, and it reads
 * only rows the user's read row filter allows. Without an acting user there is no lookup.
 *
 * A withheld name answers `Success: false` with the same status as a record that does not exist.
 * Callers already treat "no name" as "show the primary key", and the identical answer keeps this
 * query from becoming a probe that distinguishes "restricted" from "missing".
 */
@Resolver(EntityRecordNameResult)
export class EntityRecordNameResolver extends ResolverBase {
  @Query(() => EntityRecordNameResult)
  async GetEntityRecordName(
    @Arg('EntityName', () => String) EntityName: string,
    @Arg('CompositeKey', () => CompositeKeyInputType) primaryKey: CompositeKey,
    @Ctx() { providers, userPayload }: AppContext
  ): Promise<EntityRecordNameResult> {
    const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    this.CheckUserReadPermissions(EntityName, userPayload, md);

    return await this.InnerGetEntityRecordName(md, EntityName, primaryKey, userPayload);
  }

  @Query(() => [EntityRecordNameResult])
  async GetEntityRecordNames(
    @Arg('info', () => [EntityRecordNameInput]) info: EntityRecordNameInput[],
    @Ctx() {providers, userPayload}: AppContext
  ): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    for (const i of info) {
      // Per item, because the batch spans entities: one denied entity must not fail the whole
      // batch, and must not be answered from another entity's grant either.
      this.CheckUserReadPermissions(i.EntityName, userPayload, md);
      result.push(await this.InnerGetEntityRecordName(md, i.EntityName, i.CompositeKey, userPayload));
    }
    return result;
  }

  async InnerGetEntityRecordName(
    md: DatabaseProviderBase,
    EntityName: string,
    primaryKey: CompositeKeyInputType,
    userPayload?: UserPayload
  ): Promise<EntityRecordNameResult> {
    const pk = new CompositeKey(primaryKey.KeyValuePairs);
    const e = md.Entities.find((e) => e.Name === EntityName);
    if (e) {
      const contextUser = userPayload ? this.GetUserFromPayload(userPayload) : undefined;
      // The acting user is what field- and row-level security are applied for.
      const recordName = contextUser ? await md.GetEntityRecordName(e.Name, pk, contextUser) : '';
      if (recordName) return { Success: true, Status: 'OK', CompositeKey: pk, RecordName: recordName, EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${pk.ToString()} itself not found, could be an access issue`,
          CompositeKey: pk,
          EntityName,
        };
    } else return { Success: false, Status: `Entity ${EntityName} not found`, CompositeKey: pk, EntityName };
  }
}

export default EntityRecordNameResolver;
