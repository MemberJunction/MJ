import { BaseEngine, IMetadataProvider, Metadata, UserInfo, LogError, LogStatus, RegisterForStartup } from '@memberjunction/core';
import { MJUserNotificationEntity, MJUserNotificationTypeEntity, MJUserNotificationPreferenceEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { SendNotificationParams, NotificationResult, DeliveryChannels } from './types';

/*
 * Unified notification engine that handles in-app, email, and SMS delivery
 * based on notification types and user preferences.
 *
 * This engine relies on UserInfoEngine for notification types and preferences.
 * UserInfoEngine loads and caches all notification metadata via BaseEngine.
 */
export class NotificationEngine extends BaseEngine<NotificationEngine> {
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
    // Ensure UserInfoEngine is configured (it loads notification types)
    await UserInfoEngine.Instance.Config(forceRefresh, contextUser, provider);

    // BaseEngine Load with empty configs - we don't load our own data
    await this.Load([], provider || Metadata.Provider, forceRefresh, contextUser);
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
    const byId = types.find(t => t.ID === nameOrId);
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

      // Determine delivery channels
      const channels = this.resolveDeliveryChannels(params, prefs, type);
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
  ): DeliveryChannels {
    // If forceDeliveryChannels is specified, use it directly
    if (params.forceDeliveryChannels) {
      return params.forceDeliveryChannels;
    }

    // Check if user has opted out entirely (master switch)
    if (prefs && !prefs.Enabled) {
      return { inApp: false, email: false, sms: false };
    }

    // Determine each channel: user pref (if allowed and set) > type default
    const allowUserPref = type.AllowUserPreference !== false;

    // Resolve InApp channel
    const inApp = (allowUserPref && prefs?.InAppEnabled != null)
      ? prefs.InAppEnabled
      : (type.DefaultInApp ?? false);

    // Resolve Email channel
    const email = (allowUserPref && prefs?.EmailEnabled != null)
      ? prefs.EmailEnabled
      : (type.DefaultEmail ?? false);

    // Resolve SMS channel
    const sms = (allowUserPref && prefs?.SMSEnabled != null)
      ? prefs.SMSEnabled
      : (type.DefaultSMS ?? false);

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
    const md = new Metadata();
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
    const templateEntity = templateEngine.Templates.find((t) => t.ID === emailTemplateId);
    if (!templateEntity) {
      throw new Error(`Email template not found: ${emailTemplateId}`);
    }

    // Get user from cache (server-side optimization - no database query)
    const user = UserCache.Instance.Users.find((u) => u.ID === params.userId);
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

    const sendResult = await commEngine.SendSingleMessage('SendGrid', 'Email', message, undefined, false);

    const success = sendResult?.Success === true;

    if (success) {
      LogStatus(`Email sent successfully to ${user.Email} for notification type: ${type.Name}`);
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
    const templateEntity = templateEngine.Templates.find((t) => t.ID === smsTemplateId);
    if (!templateEntity) {
      throw new Error(`SMS template not found: ${smsTemplateId}`);
    }

    // Get user from cache (server-side optimization - no database query)
    const user = UserCache.Instance.Users.find((u) => u.ID === params.userId);
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

    const sendResult = await commEngine.SendSingleMessage('Twilio', 'Standard SMS', message, undefined, false);

    const success = sendResult?.Success === true;

    if (success) {
      LogStatus(`SMS sent successfully to ${userWithPhone.Phone} for notification type: ${type.Name}`);
    }

    return success;
  }
}
