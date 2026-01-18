import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { UserNotificationPreferenceEntity } from '../generated/entity_subclasses';
import { RegisterClass } from '@memberjunction/global';
import { UserInfoEngine } from '../engines/UserInfoEngine';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

// Track which TransactionGroups already have a refresh subscription to avoid duplicates
const subscribedTransactionGroups = new WeakSet<object>();

@RegisterClass(BaseEntity, 'MJ: User Notification Preferences')
export class UserNotificationPreferenceEntityExtended extends UserNotificationPreferenceEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    const result = await super.Save(options);

    if (result && this.TransactionGroup) {
      // Only subscribe once per TransactionGroup to avoid multiple refresh calls
      if (!subscribedTransactionGroups.has(this.TransactionGroup)) {
        subscribedTransactionGroups.add(this.TransactionGroup);
        const userId = this.UserID;
        const provider = this.ProviderToUse;
        const activeUser = this.ActiveUser;

        this.TransactionGroup.TransactionNotifications$.subscribe(({ success }) => {
          if (success) {
            // Fire-and-forget: don't block the UI waiting for cache refresh
            void this.doRefreshCache(userId, provider, activeUser);
          }
        });
      }
    }

    return result;
  }

  private async doRefreshCache(userId: string, provider: unknown, activeUser: unknown): Promise<void> {
    try {
      // On client side with GraphQL provider: call mutation to refresh SERVER cache
      if (provider instanceof GraphQLDataProvider) {
        const mutation = `mutation RefreshUserPreferencesCache($userId: String) {
          RefreshUserPreferencesCache(userId: $userId)
        }`;
        // Fire-and-forget server refresh - don't await
        void (provider as GraphQLDataProvider).ExecuteGQL(mutation, { userId });
      }

      // Fire-and-forget local cache refresh
      void UserInfoEngine.Instance.RefreshUserPreferences(userId, activeUser as import('@memberjunction/core').UserInfo);
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    }
  }
}
