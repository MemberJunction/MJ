import { BaseEngine, IMetadataProvider, Metadata, RunView, UserInfo, LogError, LogStatus, RegisterForStartup } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJUserNotificationEntity, MJUserNotificationTypeEntity, MJUserNotificationPreferenceEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SendNotificationParams, NotificationResult, DeliveryChannels } from './types';
import {
  CreateScopedNotificationConfigResolver,
  ResolveChannel,
  type ScopedChannelDecisions,
  type ScopedNotificationConfigRow,
} from './scoped-notification-config-resolver';

/*
 * Unified notification engine that handles in-app, email, and SMS delivery
 * based on notification types, scoped configs and user preferences.
 *
 * This engine relies on UserInfoEngine for notification types and preferences, and loads
 * `MJ: Scoped Notification Configs` itself: the level between a type's defaults and a
 * recipient's preference where an application, a role or a notice's origin can speak.
 */
export class NotificationEngine extends BaseEngine<NotificationEngine> {
  /**
   * Communication provider that sends notification email (#5983). Order: this property (a host sets it from
   * `mj.config.cjs` `notifications.emailProvider`), then `NOTIFICATION_EMAIL_PROVIDER`, then `SendGrid`.
   * MS Graph sends as the From mailbox, so `NOTIFICATION_FROM_EMAIL` must be a mailbox the app registration may send as.
   */
  public static EmailProviderName: string | undefined;

  /** Communication provider that sends notification SMS. Order: this property, `NOTIFICATION_SMS_PROVIDER`, `Twilio`. */
  public static SMSProviderName: string | undefined;

  /** The email provider name in effect, and the setting it came from (for error messages). */
  public static ResolveEmailProvider(): { name: string; setting: string } {
    return ResolveProviderSetting(NotificationEngine.EmailProviderName, 'notifications.emailProvider', 'NOTIFICATION_EMAIL_PROVIDER', 'SendGrid');
  }

  /** The SMS provider name in effect, and the setting it came from (for error messages). */
  public static ResolveSMSProvider(): { name: string; setting: string } {
    return ResolveProviderSetting(NotificationEngine.SMSProviderName, 'notifications.smsProvider', 'NOTIFICATION_SMS_PROVIDER', 'Twilio');
  }

  /**
   * Returns the singleton instance of the NotificationEngine
   */
  public static get Instance(): NotificationEngine {
    return super.getInstance<NotificationEngine>();
  }

  /**
   * Configures the notification engine.
   *
   * NOTE: This does NOT load notification types - UserInfoEngine handles that.
   * UserInfoEngine is auto-configured via @RegisterForStartup() and loads notification types
   * into its cache. This engine just provides the delivery mechanism.
   *
   * @param forceRefresh - If true, reloads data even if already loaded
   * @param contextUser - User context for database operations (required on server)
   * @param provider - Optional metadata provider override
   */
  public async Config(
    forceRefresh: boolean = false,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<void> {
    // Ensure UserInfoEngine is configured (it loads notification types and the recipient's preferences)
    await UserInfoEngine.Instance.Config(forceRefresh, contextUser, provider);
    // This engine's own data: the scoped configs, a global reference table (no user filter)
    await this.Load(
      [
        {
          Type: 'entity',
          EntityName: 'MJ: Scoped Notification Configs',
          PropertyName: '_scopedConfigs',
          CacheLocal: true,
        },
      ],
      provider ?? Metadata.Provider,
      forceRefresh,
      contextUser,
    );
  }

  private _scopedConfigs: ScopedNotificationConfigRow[] = [];

  /** Every `MJ: Scoped Notification Configs` row, any status; the resolver filters. */
  public get ScopedNotificationConfigs(): ScopedNotificationConfigRow[] {
    return this._scopedConfigs ?? [];
  }

  /**
   * What the scoped configs say for this notice, for the recipient and the roles they hold. Public so a host can
   * see the decision a notice got, and so tests can drive it without sending.
   */
  public ResolveScopedChannels(params: SendNotificationParams, typeId: string, roleIds?: string[]): ScopedChannelDecisions {
    return CreateScopedNotificationConfigResolver().Resolve(this.ScopedNotificationConfigs, typeId, params.scope, {
      userId: params.userId,
      roleIds: roleIds ?? this.cachedRoleIds(params.userId) ?? [],
    });
  }

  /** The recipient's role IDs from `UserCache`, or null when the recipient is not cached. */
  private cachedRoleIds(userId: string): string[] | null {
    const recipient = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, userId));
    return recipient ? (recipient.UserRoles ?? []).map((r) => r.RoleID).filter((id): id is string => !!id) : null;
  }

  /**
   * The recipient's role IDs for scoped-config resolution (#5492). A recipient missing from `UserCache` (created after
   * the cache loaded, say) used to resolve with no roles, so a locked Deny scoped to one of their roles stopped
   * applying. On a miss the roles are read from `MJ: User Roles`; if that read fails too, the result fails closed: the
   * recipient is treated as holding every role that has a locked Deny for this type, so those Denies still apply.
   */
  public async ResolveRecipientRoleIds(userId: string, typeId: string, contextUser: UserInfo): Promise<string[]> {
    const cached = this.cachedRoleIds(userId);
    if (cached) return cached;
    try {
      const rv = this.ProviderToUse ? RunView.FromMetadataProvider(this.ProviderToUse) : new RunView();
      const result = await rv.RunView<{ RoleID: string }>(
        {
          EntityName: 'MJ: User Roles',
          ExtraFilter: `UserID='${userId.replace(/'/g, "''")}'`,
          Fields: ['RoleID'],
          ResultType: 'simple',
        },
        contextUser,
      );
      if (result.Success) {
        LogStatus(`[NotificationEngine] Recipient ${userId} is not in UserCache; read ${result.Results.length} role(s) from MJ: User Roles.`);
        return result.Results.map((r) => r.RoleID).filter((id): id is string => !!id);
      }
      LogError(`[NotificationEngine] Could not read roles of recipient ${userId}: ${result.ErrorMessage}. Applying every role-scoped locked Deny.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`[NotificationEngine] Could not read roles of recipient ${userId}: ${message}. Applying every role-scoped locked Deny.`);
    }
    return this.lockedDenyRoleIds(typeId);
  }

  /** The roles named by a locked Deny row of this type: the fail-closed role set when a recipient's roles are unknown. */
  private lockedDenyRoleIds(typeId: string): string[] {
    const rolesEntityId = this.ProviderToUse?.EntityByName('MJ: Roles')?.ID;
    if (!rolesEntityId) return [];
    return this.ScopedNotificationConfigs
      .filter((c) => UUIDsEqual(c.NotificationTypeID, typeId) && c.IsLocked && !!c.PrimaryScopeRecordID)
      .filter((c) => !!c.PrimaryScopeEntityID && UUIDsEqual(c.PrimaryScopeEntityID, rolesEntityId))
      .filter((c) => c.InApp === 'Deny' || c.Email === 'Deny' || c.SMS === 'Deny')
      .map((c) => c.PrimaryScopeRecordID as string);
  }

  /**
   * Get a notification type by name (case-insensitive) or ID.
   * Uses UserInfoEngine's cached notification types.
   *
   * @param nameOrId - The notification type name or UUID
   * @returns The notification type entity or null if not found
   */
  private getNotificationType(nameOrId: string): MJUserNotificationTypeEntity | null {
    const types = UserInfoEngine.Instance.NotificationTypes;

    // Try by ID first
    const byId = types.find(t => UUIDsEqual(t.ID, nameOrId));
    if (byId) return byId;

    // Try by name (case-insensitive)
    const lowerName = nameOrId.toLowerCase();
    return types.find(t => t.Name.toLowerCase() === lowerName) || null;
  }

  /**
   * Send a notification using the unified notification system.
   *
   * This method:
   * 1. Looks up the notification type from cache
   * 2. Checks user preferences for delivery method
   * 3. Creates in-app notification if applicable
   * 4. Sends email/SMS using templates if applicable
   *
   * @param params - Notification parameters
   * @param contextUser - User context for database operations
   * @returns Result indicating success and delivery details
   */
  public async SendNotification(params: SendNotificationParams, contextUser: UserInfo): Promise<NotificationResult> {
    this.TryThrowIfNotLoaded();

    const result: NotificationResult = {
      success: true,
      deliveryChannels: { inApp: false, email: false, sms: false },
      errors: [],
    };

    try {
      // Look up notification type from cache
      const type = this.getNotificationType(params.typeNameOrId);
      if (!type) {
        throw new Error(`Notification type not found: ${params.typeNameOrId}`);
      }

      // looks up user preference from cache
      const prefs = this.getUserPreferences(params.userId, type.ID);

      // The recipient's roles, read when they are not cached, so role-scoped configs apply to them (#5492)
      const roleIds = params.forceDeliveryChannels ? [] : await this.ResolveRecipientRoleIds(params.userId, type.ID, contextUser);

      // Determine delivery channels
      const channels = this.resolveDeliveryChannels(params, prefs, type, roleIds);
      result.deliveryChannels = channels;

      // Early return if user has opted out (all channels disabled)
      if (!channels.inApp && !channels.email && !channels.sms) {
        LogStatus(`User has opted out or all channels disabled for notification type: ${type.Name}`);
        return result;
      }

      // 5. Create in-app notification if enabled (awaited - fast DB insert)
      if (channels.inApp) {
        result.inAppNotificationId = await this.createInAppNotification(params, type, contextUser);
      }

      // 6. Send email if enabled - fire and forget (don't block)
      if (channels.email) {
        result.emailSent = true; // Optimistically set - actual send is async
        this.sendEmail(params, type, contextUser).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          LogError(`Email delivery failed for notification type ${type.Name}: ${errorMessage}`);
        });
      }

      // 7. Send SMS if enabled - fire and forget (don't block)
      if (channels.sms) {
        result.smsSent = true; // Optimistically set - actual send is async
        this.sendSMS(params, type, contextUser).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          LogError(`SMS delivery failed for notification type ${type.Name}: ${errorMessage}`);
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.success = false;
      result.errors?.push(errorMessage);
      LogError(`Notification delivery failed: ${errorMessage}`);
      return result;
    }
  }

  /**
   * Resolve the effective delivery channels based on force, preference, and type defaults.
   * Uses the new boolean column approach for flexible multi-channel selection.
   */
  private resolveDeliveryChannels(
    params: SendNotificationParams,
    prefs: MJUserNotificationPreferenceEntity | null,
    type: MJUserNotificationTypeEntity,
    roleIds: string[],
  ): DeliveryChannels {
    return this.applyChannelCeiling(this.resolvePreferredChannels(params, prefs, type, roleIds), params.allowedDeliveryChannels);
  }

  /**
   * Apply a caller-supplied ceiling to already-resolved channels.
   *
   * Subtractive only: an explicit `false` turns a channel off, anything else leaves it alone. That
   * asymmetry is the point — a caller composing its own channel toggles with the recipient's
   * preferences must not be able to turn a channel back ON that the recipient declined.
   */
  private applyChannelCeiling(channels: DeliveryChannels, ceiling?: Partial<DeliveryChannels>): DeliveryChannels {
    if (!ceiling) {
      return channels;
    }
    return {
      inApp: channels.inApp && ceiling.inApp !== false,
      email: channels.email && ceiling.email !== false,
      sms: channels.sms && ceiling.sms !== false,
    };
  }

  /** Channel resolution from force / preferences / type defaults, before any ceiling is applied. */
  private resolvePreferredChannels(
    params: SendNotificationParams,
    prefs: MJUserNotificationPreferenceEntity | null,
    type: MJUserNotificationTypeEntity,
    roleIds: string[],
  ): DeliveryChannels {
    // If forceDeliveryChannels is specified, use it directly
    if (params.forceDeliveryChannels) {
      return params.forceDeliveryChannels;
    }

    // Check if user has opted out entirely (master switch)
    if (prefs && !prefs.Enabled) {
      return { inApp: false, email: false, sms: false };
    }
    // Each channel, most specific wins: the recipient's preference (if the type allows one and it is set), then the
    // scoped configs (global, application, role, recipient; Deny beats Allow at equal specificity), then the type's
    // default. A locked Deny at the scoped level turns the channel off regardless of specificity and caps the
    // recipient's preference.
    const allowUserPref = type.AllowUserPreference !== false;
    const scoped = this.ResolveScopedChannels(params, type.ID, roleIds);
    const pref = (value: boolean | null | undefined) => (allowUserPref && value != null ? value : null);
    const inApp = ResolveChannel({ typeDefault: type.DefaultInApp ?? false, scoped: scoped.inApp, userPreference: pref(prefs?.InAppEnabled) });
    const email = ResolveChannel({ typeDefault: type.DefaultEmail ?? false, scoped: scoped.email, userPreference: pref(prefs?.EmailEnabled) });
    const sms = ResolveChannel({ typeDefault: type.DefaultSMS ?? false, scoped: scoped.sms, userPreference: pref(prefs?.SMSEnabled) });
    if (scoped.rows.length > 0) {
      LogStatus(`Notification '${type.Name}' resolved through ${scoped.rows.length} scoped config(s): inApp=${inApp} email=${email} sms=${sms}`);
    }
    return { inApp, email, sms };
  }

  /**
   * Get user preferences for a notification type from UserInfoEngine's cache.
   * Preferences are still cached in UserInfoEngine (user-specific data).
   */
  private getUserPreferences(
    userId: string,
    typeId: string
  ): MJUserNotificationPreferenceEntity | null {
    // Use cached preferences from UserInfoEngine (user-specific)
    const pref = UserInfoEngine.Instance.GetUserPreferenceForType(userId, typeId);

    // If preference exists, return it
    if (pref) {
      return pref;
    }

    // If no preference exists and the type doesn't allow user preferences, return null
    const type = this.getNotificationType(typeId);
    if (type && !type.AllowUserPreference) {
      return null;
    }

    // If we reach here, the user hasn't set a preference yet
    // Return null to use type defaults
    return null;
  }

  /**
   * Create in-app notification record
   */
  private async createInAppNotification(
    params: SendNotificationParams,
    type: MJUserNotificationTypeEntity,
    contextUser: UserInfo
  ): Promise<string> {
    const md = this.ProviderToUse;
    const notification = await md.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications', contextUser);

    notification.UserID = params.userId;
    notification.NotificationTypeID = type.ID;
    notification.Title = params.title;
    notification.Message = params.message;
    notification.Unread = true;

    if (params.resourceTypeId) {
      notification.ResourceTypeID = params.resourceTypeId;
    }
    if (params.resourceRecordId) {
      notification.ResourceRecordID = params.resourceRecordId;
    }
    if (params.resourceConfiguration) {
      notification.ResourceConfiguration = JSON.stringify(params.resourceConfiguration);
    }

    if (await notification.Save()) {
      LogStatus(`In-app notification created: ${notification.ID} for type: ${type.Name}`);
      return notification.ID;
    }

    throw new Error('Failed to save in-app notification');
  }

  /**
   * Send email notification using template
   */
  private async sendEmail(
    params: SendNotificationParams,
    type: MJUserNotificationTypeEntity,
    contextUser: UserInfo
  ): Promise<boolean> {
    // Access EmailTemplateID
    const emailTemplateId = type.EmailTemplateID;

    if (!emailTemplateId) {
      LogStatus(`No email template configured for notification type: ${type.Name}`);
      return false;
    }

    // Load and configure template engine (loads all template metadata)
    const templateEngine = TemplateEngineServer.Instance;
    await templateEngine.Config(false, contextUser);

    // Find the email template from the cached Templates array
    const templateEntity = templateEngine.Templates.find((t) => UUIDsEqual(t.ID, emailTemplateId));
    if (!templateEntity) {
      throw new Error(`Email template not found: ${emailTemplateId}`);
    }

    // Get user from cache (server-side optimization - no database query)
    const user = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, params.userId));
    if (!user) {
      throw new Error('User not found for email delivery');
    }

    if (!user.Email) {
      throw new Error('User has no email address configured');
    }

    // Configure and send via CommunicationEngine
    const commEngine = CommunicationEngine.Instance;
    await commEngine.Config(false, contextUser);
    const message = new Message();
    message.From = process.env.NOTIFICATION_FROM_EMAIL || 'notifications@memberjunction.com';
    message.To = user.Email;
    message.HTMLBodyTemplate = templateEntity;
    message.ContextData = params.templateData || {};
    message.Subject = params.title;

    const fromAddress = message.From;
    LogStatus(
      `[NotificationEngine] Dispatching email for '${type.Name}' to ${user.Email} from ${fromAddress} ` +
      `(template=${templateEntity.Name ?? emailTemplateId})`
    );

    const provider = this.requireConfiguredProvider(commEngine, NotificationEngine.ResolveEmailProvider());
    const sendResult = await commEngine.SendSingleMessage(provider, 'Email', message, undefined, false);

    const success = sendResult?.Success === true;

    if (success) {
      LogStatus(`[NotificationEngine] Email sent successfully to ${user.Email} for notification type: ${type.Name}`);
    } else {
      LogError(
        `[NotificationEngine] Email delivery failed for type '${type.Name}' to ${user.Email} from ${fromAddress}. ` +
        `Provider reported: ${sendResult?.Error ?? '(no error message)'}`
      );
    }

    return success;
  }

  /**
   * Send SMS notification using template
   */
  private async sendSMS(
    params: SendNotificationParams,
    type: MJUserNotificationTypeEntity,
    contextUser: UserInfo
  ): Promise<boolean> {
    // Access SMSTemplateID
    const smsTemplateId = type.SMSTemplateID;

    if (!smsTemplateId) {
      LogStatus(`No SMS template configured for notification type: ${type.Name}`);
      return false;
    }

    // Load and configure template engine (loads all template metadata)
    const templateEngine = TemplateEngineServer.Instance;
    await templateEngine.Config(false, contextUser);

    // Find the SMS template from the cached Templates array
    const templateEntity = templateEngine.Templates.find((t) => UUIDsEqual(t.ID, smsTemplateId));
    if (!templateEntity) {
      throw new Error(`SMS template not found: ${smsTemplateId}`);
    }

    // Get user from cache (server-side optimization - no database query)
    const user = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, params.userId));
    if (!user) {
      throw new Error('User not found for SMS delivery');
    }

    // Type assertion since UserInfo doesn't have Phone property yet
    const userWithPhone = user as UserInfo & { Phone?: string };
    if (!userWithPhone.Phone) {
      throw new Error('User has no phone number configured');
    }

    // Send via CommunicationEngine - let it handle template rendering
    const commEngine = CommunicationEngine.Instance;
    await commEngine.Config(false, contextUser);
    const message = new Message();
    message.To = userWithPhone.Phone;
    message.BodyTemplate = templateEntity;
    message.ContextData = params.templateData || {};

    const provider = this.requireConfiguredProvider(commEngine, NotificationEngine.ResolveSMSProvider());
    const sendResult = await commEngine.SendSingleMessage(provider, 'Standard SMS', message, undefined, false);

    const success = sendResult?.Success === true;

    if (success) {
      LogStatus(`SMS sent successfully to ${userWithPhone.Phone} for notification type: ${type.Name}`);
    }

    return success;
  }

  /**
   * The provider name when Communication Engine knows it; otherwise an error naming the setting to fix, so a typo in
   * the configuration reads as one instead of a generic "provider not found".
   */
  private requireConfiguredProvider(commEngine: CommunicationEngine, choice: { name: string; setting: string }): string {
    const known = commEngine.Providers.some((p) => p.Name.trim().toLowerCase() === choice.name.trim().toLowerCase());
    if (!known) {
      throw new Error(`Notification provider '${choice.name}' (from ${choice.setting}) is not a configured Communication Provider.`);
    }
    return choice.name;
  }
}

/**
 * Picks a notification provider name: the host setting, then the environment variable, then the default, reporting
 * which one won.
 */
export function ResolveProviderSetting(
  hostValue: string | undefined,
  hostSetting: string,
  envVar: string,
  fallback: string,
): { name: string; setting: string } {
  if (hostValue && hostValue.trim()) return { name: hostValue.trim(), setting: `mj.config.cjs ${hostSetting}` };
  const env = process.env[envVar];
  if (env && env.trim()) return { name: env.trim(), setting: envVar };
  return { name: fallback, setting: `the default (set ${envVar} or ${hostSetting} to change it)` };
}
