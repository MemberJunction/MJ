import { Metadata, CompositeKey, DatabaseProviderBase } from '@memberjunction/core';
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
 * Row-level security is applied by the provider's lookup, for the acting user passed to it: it
 * reads only rows the user's read row filter allows, binds the key values as parameters, and
 * refuses a key that does not name the entity's primary key fields. Without an acting user there
 * is no lookup.
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
      // The acting user is what row-level security is applied for.
      const recordName = contextUser ? await md.GetEntityRecordName(e.Name, pk, contextUser) : '';
      if (recordName) return { Success: true, Status: 'OK', CompositeKey: pk, RecordName: recordName, EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${pk.ToString()} itself not found, could be an access issue if user doesn't have Row Level Access (RLS) if RLS is enabled for this entity`,
          CompositeKey: pk,
          EntityName,
        };
    } else return { Success: false, Status: `Entity ${EntityName} not found`, CompositeKey: pk, EntityName };
  }
}

export default EntityRecordNameResolver;
