import { BaseEngine, IMetadataProvider, Metadata, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { UserNotificationEntity, UserNotificationTypeEntity, UserEntity, UserInfoEngine, CachedUserNotificationPreference } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { SendNotificationParams, NotificationResult, DeliveryChannels } from './types';
/*
 * Unified notification engine that handles in-app, email, and SMS delivery
 * based on notification types and user preferences.
 
 */
export class NotificationEngine extends BaseEngine<NotificationEngine> {
  /**
   * Returns the singleton instance of the NotificationEngine
   */
  public static get Instance(): NotificationEngine {
    return super.getInstance<NotificationEngine>();
  }

  /**
   * Configures the notification engine by delegating to UserInfoEngine.
   * UserInfoEngine now handles caching of preferences, etc.; Notification types are globally cached..
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
    // Delegate to UserInfoEngine which now handles notification metadata
    await UserInfoEngine.Instance.Config(forceRefresh, contextUser, provider);
    await this.Load([], provider || Metadata.Provider, forceRefresh, contextUser);
  }

  /**
   * Get a notification type by name (case-insensitive) or ID.
   * Delegates to UserInfoEngine's cached data for fast lookup.
   *
   * @param nameOrId - The notification type name or UUID
   * @returns The notification type entity or null if not found
   */
  private getNotificationType(nameOrId: string): UserNotificationTypeEntity | null {
    // Delegate to UserInfoEngine's cached types
    return UserInfoEngine.Instance.GetNotificationType(nameOrId) ?? null;
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
    prefs: CachedUserNotificationPreference | null,
    type: UserNotificationTypeEntity,
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
   * Preferences are now cached in UserInfoEngine for better performance.
   */
  private getUserPreferences(
    userId: string,
    typeId: string
  ): CachedUserNotificationPreference | null {
    // Use cached preferences from UserInfoEngine
    const pref = UserInfoEngine.Instance.GetUserPreferenceForType(userId, typeId);

    // If preference exists, return it
    if (pref) {
      return pref;
    }

    // If no preference exists and the type doesn't allow user preferences, return null
    const type = UserInfoEngine.Instance.GetNotificationTypeById(typeId);
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
    type: UserNotificationTypeEntity,
    contextUser: UserInfo
  ): Promise<string> {
    const md = new Metadata();
    const notification = await md.GetEntityObject<UserNotificationEntity>('User Notifications', contextUser);

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
    type: UserNotificationTypeEntity,
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
   
    // Load user entity to get email address
    const md = new Metadata();
    const userEntity = await md.GetEntityObject<UserEntity>('Users', contextUser);
    if (!(await userEntity.Load(params.userId))) {
      throw new Error('User not found for email delivery');
    }

    if (!userEntity.Email) {
      throw new Error('User has no email address configured');
    }

    // Configure and send via CommunicationEngine
    const commEngine = CommunicationEngine.Instance;
    await commEngine.Config(false, contextUser);
    const message = new Message();
    message.From = process.env.NOTIFICATION_FROM_EMAIL || 'notifications@memberjunction.com';
    message.To = 'madhavrsubramaniyam@gmail.com'; //userEntity.Email;
    message.HTMLBodyTemplate = templateEntity;
    message.ContextData = params.templateData || {};
    message.Subject = params.title;

    const sendResult = await commEngine.SendSingleMessage('SendGrid', 'Email', message, undefined, false);

    const success = sendResult?.Success === true;

    if (success) {
      LogStatus(`Email sent successfully to ${userEntity.Email} for notification type: ${type.Name}`);
    }

    return success;
  }

  /**
   * Send SMS notification using template
   */
  private async sendSMS(
    params: SendNotificationParams,
    type: UserNotificationTypeEntity,
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

    const md = new Metadata();
    const userEntity = await md.GetEntityObject<UserEntity>('Users', contextUser);
    if (!(await userEntity.Load(params.userId))) {
      throw new Error('User not found for SMS delivery');
    }

    // Type assertion since UserEntity doesn't have Phone field yet
    const userWithPhone = userEntity as UserEntity & { Phone?: string };
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
