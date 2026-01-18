import { Resolver, Mutation, Arg, Ctx } from 'type-graphql';
import { MJUserNotificationPreferenceResolver } from '../generated/generated.js';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { AppContext } from '../types.js';

/**
 * Custom resolver for UserNotificationPreference operations.
 *
 * Cache Refresh Strategy:
 * - All saves use TransactionGroup (batched records)
 * - UserNotificationPreferenceEntityExtended subscribes to transaction completion
 * - After transaction succeeds, extended entity calls RefreshUserPreferencesCache mutation
 * - This mutation refreshes the server-side UserInfoEngine cache
 */
@Resolver()
export class UserNotificationPreferenceResolver extends MJUserNotificationPreferenceResolver {
  /**
   * GraphQL mutation to refresh server-side user notification preferences cache.
   * Called by UserNotificationPreferenceEntityExtended after TransactionGroup.Submit() succeeds.
   */
  @Mutation(() => Boolean, { description: 'Refresh server-side user notification preferences cache' })
  async RefreshUserPreferencesCache(@Arg('userId', () => String, { nullable: true }) userId: string | null, @Ctx() context: AppContext): Promise<boolean> {
    try {
      const userRecord = context?.userPayload?.userRecord;
      if (!userRecord) {
        console.error('RefreshUserPreferencesCache: No userRecord in context');
        return false;
      }

      const targetUserId = userId || userRecord.ID;
      await UserInfoEngine.Instance.RefreshUserPreferences(targetUserId, userRecord);
      return true;
    } catch (error) {
      console.error('RefreshUserPreferencesCache mutation failed:', error);
      return false;
    }
  }
}
