import { CompositeKey, DatabaseProviderBase, EntityInfo, LogDebug, UserInfo } from '@memberjunction/core';
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
 * **This is a read of entity data and is gated like one.** It historically took no user context
 * at all, which made it an open side channel: a caller denied READ on an entity's name field
 * could still obtain that name here, because the name never travelled through the resolver that
 * strips denied fields. Field-level security turned that latent gap into a live bypass — the
 * form-field FK control falls through to this query precisely WHEN the joined display column is
 * denied, so the one case the fallback exists for was the case that leaked.
 *
 * Two gates now apply, matching what the generated single-record resolvers do:
 *   1. entity-level read permission ({@link ResolverBase.CheckUserReadPermissions});
 *   2. field-level read permission on the entity's own name field.
 *
 * A field-level denial answers `Success: false` with no name rather than throwing. Callers
 * already treat "no name" as "show the primary key", which is the intended degradation — and it
 * keeps this query from becoming a probe that distinguishes "restricted" from "missing".
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
      if (this.IsNameFieldDeniedToUser(e, contextUser)) {
        LogDebug(
          `[FieldSecurity] Suppressed GetEntityRecordName for '${EntityName}': ` +
          `the name field is not readable by this user`
        );
        return {
          Success: false,
          Status: `Name for record, or record ${pk.ToString()} itself not found, could be an access issue`,
          CompositeKey: pk,
          EntityName,
        };
      }
      // Pass the acting user through: the provider signature accepts it, and omitting it ran the
      // underlying lookup with no identity at all — so row-level security had nothing to filter on
      // either. The field-level gate above is the column half; this is the row half.
      const recordName = await md.GetEntityRecordName(e.Name, pk, contextUser);
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

  /**
   * Whether field security withholds this entity's NAME field from the user.
   *
   * Resolves the name field the same way the provider's own lookup does — the designated
   * `IsNameField`, else a field literally called `Name` — so the check cannot drift from the
   * value it is guarding. Fails OPEN only where field security does not apply at all (flag off,
   * no user, no name field), matching every other FLS gate.
   */
  protected IsNameFieldDeniedToUser(entity: EntityInfo, contextUser?: UserInfo): boolean {
    if (!entity?.EnableFieldLevelSecurity || !contextUser) {
      return false;
    }
    const nameField =
      entity.Fields?.find(f => f.IsNameField) ??
      entity.Fields?.find(f => f.Name?.trim().toLowerCase() === 'name');
    if (!nameField) {
      return false;
    }
    return entity.GetDeniedReadFields(contextUser).has(nameField.Name.trim().toLowerCase());
  }
}

export default EntityRecordNameResolver;
