/**
 * @fileoverview Self-service avatar mutation: `UpdateMyAvatar(ImageURL, IconClass)`.
 *
 * WHY THIS EXISTS. Explorer's My Profile photo used to be a plain entity save of the caller's own
 * `MJ: Users` row, which needs Update permission on `MJ: Users`. A deployment that locks its
 * security model down cannot give ordinary users that permission: a row-level "own row only"
 * filter restricts ROWS, not COLUMNS, so a user who may update their own row may also rewrite
 * their own `Email` — and many read filters key on `{{UserEmail}}`, so the new value would match
 * another person's memberships. MJ has no per-role field permissions (`MJUserEntityServer` in
 * core-entities-server documents the same limit for `Type`). On such deployments every avatar save
 * failed, and the login avatar sync failed silently.
 *
 * WHAT IT DOES. The caller comes ONLY from the request context — there is no user-ID argument. The
 * input is validated at this trust boundary (`ValidateAvatarInput`). The caller's own row is then
 * loaded AS THE SYSTEM USER, any state other than the two avatar columns is discarded, and only
 * `UserImageURL` and `UserImageIconClass` are set before saving. Because the write is made as the
 * system user, the caller's ID is logged. It works the same whether or not the caller holds Update
 * on `MJ: Users`.
 *
 * `MJUserEntityServer` accepts this save: the system user is the seeded `Type='Owner'` user, which
 * is exempt from its invariants, and the save changes neither `Type` nor `Name` in any case.
 *
 * @module @memberjunction/server/resolvers/UserAvatarResolver
 */
import { Arg, Ctx, Field, Mutation, ObjectType, Resolver } from 'type-graphql';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import type { MJUserEntity } from '@memberjunction/core-entities';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';
import { GetSystemUser } from '../auth/index.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { ValidateAvatarInput } from './avatarInputValidation.js';

/** What the browser sees when the save fails. The server's detail goes to the log only. */
const SAVE_FAILED_MESSAGE = 'Could not save your avatar. Please try again or contact your administrator.';

@ObjectType()
export class UpdateMyAvatarResult {
  @Field()
  Success: boolean;

  @Field({ nullable: true })
  ErrorMessage?: string;
}

@Resolver()
export class UserAvatarResolver extends ResolverBase {
  /**
   * Sets the CALLER's avatar. Null or empty clears a column; both null reverts to the default.
   * Validation failures and save failures are returned as `Success: false` with a message.
   */
  @Mutation(() => UpdateMyAvatarResult)
  async UpdateMyAvatar(
    @Ctx() ctx: AppContext,
    @Arg('ImageURL', () => String, { nullable: true }) imageURL?: string | null,
    @Arg('IconClass', () => String, { nullable: true }) iconClass?: string | null,
  ): Promise<UpdateMyAvatarResult> {
    const caller = ctx.userPayload?.userRecord as UserInfo | undefined;
    if (!caller?.ID) {
      throw new Error('User is not authenticated');
    }
    await this.CheckAPIKeyScopeAuthorization('entity:update', 'MJ: Users', ctx.userPayload);

    const input = ValidateAvatarInput(imageURL, iconClass);
    if (!input.Valid) {
      return { Success: false, ErrorMessage: input.ErrorMessage };
    }

    try {
      return await this.saveAvatar(ctx, caller, input.ImageURL, input.IconClass);
    } catch (e) {
      LogError(`UpdateMyAvatar: failed for user ${caller.ID}: ${e instanceof Error ? e.message : String(e)}`);
      return { Success: false, ErrorMessage: SAVE_FAILED_MESSAGE };
    }
  }

  /** Loads the caller's own row as the system user and writes ONLY the two avatar columns. */
  private async saveAvatar(
    ctx: AppContext,
    caller: UserInfo,
    imageURL: string | null,
    iconClass: string | null,
  ): Promise<UpdateMyAvatarResult> {
    const systemUser = await GetSystemUser();
    const provider = GetReadWriteProvider(ctx.providers);
    const user = await provider.GetEntityObject<MJUserEntity>('MJ: Users', systemUser);
    if (!(await user.Load(caller.ID))) {
      LogError(`UpdateMyAvatar: could not load the MJ: Users row for user ${caller.ID}`);
      return { Success: false, ErrorMessage: 'Could not load your user record.' };
    }

    user.Revert(); // nothing but the two avatar columns may reach the write
    user.UserImageURL = imageURL;
    user.UserImageIconClass = iconClass;
    LogStatus(`UpdateMyAvatar: user ${caller.ID} requested an avatar change; saving as the system user`);
    if (!(await user.Save())) {
      const detail = user.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(`UpdateMyAvatar: save failed for user ${caller.ID}: ${detail}`);
      return { Success: false, ErrorMessage: SAVE_FAILED_MESSAGE };
    }
    return { Success: true };
  }
}
