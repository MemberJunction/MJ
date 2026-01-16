import { BaseEngine, IMetadataProvider, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { UserNotificationEntity, UserNotificationTypeEntity, UserNotificationPreferenceEntity, UserEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { SendNotificationParams, NotificationResult, DeliveryMethod, DeliveryChannels } from './types';

/**
 * Extended UserNotificationTypeEntity with template fields that exist at runtime
 * but aren't yet in CodeGen-generated types
 */
interface UserNotificationTypeWithTemplates extends UserNotificationTypeEntity {
  EmailTemplateID: string | null;
  SMSTemplateID: string | null;
}

/**
 * Type alias for notification type with boolean delivery channel fields.
 * These fields now exist in the generated entity after CodeGen.
 */
type UserNotificationTypeWithBooleans = UserNotificationTypeEntity & {
  DefaultInApp?: boolean;
  DefaultEmail?: boolean;
  DefaultSMS?: boolean;
};

/**
 * Type alias for preference with boolean channel fields.
 * These fields now exist in the generated entity after CodeGen.
 */
type UserNotificationPreferenceWithBooleans = UserNotificationPreferenceEntity & {
  InAppEnabled?: boolean | null;
  EmailEnabled?: boolean | null;
  SMSEnabled?: boolean | null;
};

/**
 * Unified notification engine that handles in-app, email, and SMS delivery
 * based on notification types and user preferences.
 *
 * Extends BaseEngine to provide:
 * - Cached notification types (loaded once, auto-refreshed on changes)
 * - Singleton pattern with proper MJ infrastructure
 * - Integration with MJ startup system
 *
 * @example
 * ```typescript
 * // Initialize the engine (typically at server startup)
 * await NotificationEngine.Instance.Config(false, contextUser);
 *
 * // Send a notification
 * const result = await NotificationEngine.Instance.SendNotification({
 *   userId: user.ID,
 *   typeNameOrId: 'Agent Completion',
 *   title: 'Task Complete',
 *   message: 'Your AI agent has finished processing',
 *   templateData: { agentName: 'My Agent' }
 * }, contextUser);
 * ```
 */
export class NotificationEngine extends BaseEngine<NotificationEngine> {
  /**
   * Cached notification types - loaded once and auto-refreshed when types change
   */
  public NotificationTypes: UserNotificationTypeEntity[] = [];

  /**
   * Lookup map for fast notification type retrieval by name (lowercase)
   */
  private _typesByName: Map<string, UserNotificationTypeEntity> = new Map();

  /**
   * Lookup map for fast notification type retrieval by ID
   */
  private _typesById: Map<string, UserNotificationTypeEntity> = new Map();

  /**
   * Returns the singleton instance of the NotificationEngine
   */
  public static get Instance(): NotificationEngine {
    return super.getInstance<NotificationEngine>();
  }

  /**
   * Configures the notification engine by loading notification types.
   * Must be called before sending notifications.
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
    await this.Load(
      [
        {
          PropertyName: 'NotificationTypes',
          EntityName: 'MJ: User Notification Types',
          Type: 'entity',
          OrderBy: 'Priority ASC, Name ASC'
        }
      ],
      provider ?? Metadata.Provider,
      forceRefresh,
      contextUser
    );
  }

  /**
   * Post-processing after loading notification types.
   * Builds lookup maps for fast retrieval.
   */
  protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
    // Build lookup maps for fast retrieval
    this._typesByName.clear();
    this._typesById.clear();

    for (const type of this.NotificationTypes) {
      this._typesByName.set(type.Name.toLowerCase().trim(), type);
      this._typesById.set(type.ID, type);
    }

    LogStatus(`NotificationEngine loaded ${this.NotificationTypes.length} notification types`);
  }

  /**
   * Get a notification type by name (case-insensitive) or ID.
   * Uses cached data for fast lookup.
   *
   * @param nameOrId - The notification type name or UUID
   * @returns The notification type entity or null if not found
   */
  public getNotificationType(nameOrId: string): UserNotificationTypeEntity | null {
    this.TryThrowIfNotLoaded();

    // Check if it's a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId);

    if (isUuid) {
      return this._typesById.get(nameOrId) ?? null;
    } else {
      return this._typesByName.get(nameOrId.toLowerCase().trim()) ?? null;
    }
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

    const defaultChannels: DeliveryChannels = { inApp: false, email: false, sms: false };
    const result: NotificationResult = {
      success: true,
      deliveryMethod: 'None',
      deliveryChannels: defaultChannels,
      errors: [],
    };

    try {
      // 1. Look up notification type from cache (fast!)
      const type = this.getNotificationType(params.typeNameOrId);
      if (!type) {
        throw new Error(`Notification type not found: ${params.typeNameOrId}`);
      }

      // 2. Load user preferences (per-call, user-specific - not cached)
      const prefs = await this.getUserPreferences(params.userId, type.ID, contextUser);

      // 3. Check if user has opted out entirely
      if (prefs && !prefs.Enabled) {
        result.success = true;
        result.deliveryMethod = 'None';
        result.deliveryChannels = defaultChannels;
        LogStatus(`User has opted out of notification type: ${type.Name}`);
        return result;
      }

      // 4. Determine delivery channels (new boolean-based approach)
      const channels = this.resolveDeliveryChannels(params, prefs, type);
      result.deliveryChannels = channels;

      // Also set legacy deliveryMethod for backwards compatibility
      result.deliveryMethod = this.channelsToDeliveryMethod(channels);

      // 5. Create in-app notification if enabled
      if (channels.inApp) {
        result.inAppNotificationId = await this.createInAppNotification(params, type, contextUser);
      }

      // 6. Send email if enabled
      if (channels.email) {
        try {
          result.emailSent = await this.sendEmail(params, type, contextUser);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors?.push(`Email delivery failed: ${errorMessage}`);
          LogError(`Email delivery failed for notification type ${type.Name}: ${errorMessage}`);
        }
      }

      // 7. Send SMS if enabled
      if (channels.sms) {
        try {
          result.smsSent = await this.sendSMS(params, type, contextUser);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors?.push(`SMS delivery failed: ${errorMessage}`);
          LogError(`SMS delivery failed for notification type ${type.Name}: ${errorMessage}`);
        }
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
    prefs: UserNotificationPreferenceEntity | null,
    type: UserNotificationTypeEntity,
  ): DeliveryChannels {
    // If forceDeliveryChannels is specified, use it directly
    if (params.forceDeliveryChannels) {
      return params.forceDeliveryChannels;
    }

    // Legacy support: convert forceDeliveryMethod to channels
    if (params.forceDeliveryMethod) {
      return this.deliveryMethodToChannels(params.forceDeliveryMethod);
    }

    // Cast to access new boolean fields (until CodeGen runs)
    const typeWithBooleans = type as UserNotificationTypeWithBooleans;
    const prefsWithBooleans = prefs as UserNotificationPreferenceWithBooleans | null;

    // Determine each channel: user pref (if allowed and set) > type default
    const allowUserPref = type.AllowUserPreference !== false;

    // Resolve InApp channel
    let inApp: boolean;
    if (allowUserPref && prefsWithBooleans?.InAppEnabled != null) {
      inApp = prefsWithBooleans.InAppEnabled;
    } else if (typeWithBooleans.DefaultInApp != null) {
      inApp = typeWithBooleans.DefaultInApp;
    } else {
      // Fallback to legacy DefaultDeliveryMethod parsing
      const legacyDefault = (type as { DefaultDeliveryMethod?: string }).DefaultDeliveryMethod;
      inApp = legacyDefault === 'InApp' || legacyDefault === 'All';
    }

    // Resolve Email channel
    let email: boolean;
    if (allowUserPref && prefsWithBooleans?.EmailEnabled != null) {
      email = prefsWithBooleans.EmailEnabled;
    } else if (typeWithBooleans.DefaultEmail != null) {
      email = typeWithBooleans.DefaultEmail;
    } else {
      const legacyDefault = (type as { DefaultDeliveryMethod?: string }).DefaultDeliveryMethod;
      email = legacyDefault === 'Email' || legacyDefault === 'All';
    }

    // Resolve SMS channel
    let sms: boolean;
    if (allowUserPref && prefsWithBooleans?.SMSEnabled != null) {
      sms = prefsWithBooleans.SMSEnabled;
    } else if (typeWithBooleans.DefaultSMS != null) {
      sms = typeWithBooleans.DefaultSMS;
    } else {
      const legacyDefault = (type as { DefaultDeliveryMethod?: string }).DefaultDeliveryMethod;
      sms = legacyDefault === 'SMS' || legacyDefault === 'All';
    }

    return { inApp, email, sms };
  }

  /**
   * Convert legacy DeliveryMethod enum to DeliveryChannels
   */
  private deliveryMethodToChannels(method: DeliveryMethod): DeliveryChannels {
    switch (method) {
      case 'InApp':
        return { inApp: true, email: false, sms: false };
      case 'Email':
        return { inApp: false, email: true, sms: false };
      case 'SMS':
        return { inApp: false, email: false, sms: true };
      case 'All':
        return { inApp: true, email: true, sms: true };
      case 'None':
      default:
        return { inApp: false, email: false, sms: false };
    }
  }

  /**
   * Convert DeliveryChannels to legacy DeliveryMethod for backwards compatibility
   */
  private channelsToDeliveryMethod(channels: DeliveryChannels): DeliveryMethod {
    const { inApp, email, sms } = channels;

    if (!inApp && !email && !sms) {
      return 'None';
    }
    if (inApp && email && sms) {
      return 'All';
    }
    if (inApp && !email && !sms) {
      return 'InApp';
    }
    if (!inApp && email && !sms) {
      return 'Email';
    }
    if (!inApp && !email && sms) {
      return 'SMS';
    }
    // Mixed combinations default to 'All' for legacy compatibility
    return 'All';
  }

  /**
   * Load user preferences for a notification type.
   * This is NOT cached because preferences are user-specific and can change frequently.
   */
  private async getUserPreferences(
    userId: string,
    typeId: string,
    contextUser: UserInfo
  ): Promise<UserNotificationPreferenceEntity | null> {
    const rv = new RunView();
    const result = await rv.RunView<UserNotificationPreferenceEntity>(
      {
        EntityName: 'MJ: User Notification Preferences',
        ExtraFilter: `UserID='${userId}' AND NotificationTypeID='${typeId}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );

    if (result.Success && result.Results && result.Results.length > 0) {
      return result.Results[0];
    }

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
    // Access EmailTemplateID (field exists at runtime but not yet in TypeScript types)
    const emailTemplateId = (type as UserNotificationTypeWithTemplates).EmailTemplateID;

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

    // Get highest priority HTML content from the template's Content array
    // The Content array is already loaded and associated by TemplateEngineBase.AdditionalLoading()
    const htmlContent = templateEntity.Content?.filter(
      (c) => c.IsActive && c.Type?.trim().toLowerCase() === 'html'
    ).sort((a, b) => (b.Priority || 0) - (a.Priority || 0))[0];

    if (!htmlContent) {
      throw new Error('No active HTML content found for email template');
    }

    // Render template
    const renderResult = await templateEngine.RenderTemplate(
      templateEntity,
      htmlContent,
      params.templateData || {},
      true, // skip validation for flexibility
    );

    if (!renderResult.Success) {
      throw new Error(`Template rendering failed: ${renderResult.Message}`);
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
    message.HTMLBody = renderResult.Output!;
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
    // Access SMSTemplateID (field exists at runtime but not yet in TypeScript types)
    const smsTemplateId = (type as UserNotificationTypeWithTemplates).SMSTemplateID;

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

    // Get highest priority Text content from the template's Content array
    // The Content array is already loaded and associated by TemplateEngineBase.AdditionalLoading()
    const textContent = templateEntity.Content?.filter(
      (c) => c.IsActive && c.Type?.trim().toLowerCase() === 'text'
    ).sort((a, b) => (b.Priority || 0) - (a.Priority || 0))[0];

    if (!textContent) {
      throw new Error('No active Text content found for SMS template');
    }

    // Render template
    const renderResult = await templateEngine.RenderTemplate(
      templateEntity,
      textContent,
      params.templateData || {},
      true
    );

    if (!renderResult.Success) {
      throw new Error(`Template rendering failed: ${renderResult.Message}`);
    }

    // Load user entity to get phone number
    // TODO: UserEntity doesn't have a Phone field yet - need to determine correct field to use
    // For now, this will throw an error if SMS is attempted
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

    // Send via CommunicationEngine
    // Use Twilio as default SMS provider (can be made configurable later)
    const commEngine = CommunicationEngine.Instance;
    await commEngine.Config(false, contextUser);
    const message = new Message();
    message.To = userWithPhone.Phone;
    message.Body = renderResult.Output!;

    const sendResult = await commEngine.SendSingleMessage('Twilio', 'Standard SMS', message, undefined, false);

    const success = sendResult?.Success === true;

    if (success) {
      LogStatus(`SMS sent successfully to ${userWithPhone.Phone} for notification type: ${type.Name}`);
    }

    return success;
  }
}
