/**
 * Individual channel settings for notification delivery.
 * Each channel can be independently enabled or disabled.
 */
export interface DeliveryChannels {
  /**
   * Whether in-app notifications are enabled
   */
  inApp: boolean;

  /**
   * Whether email notifications are enabled
   */
  email: boolean;

  /**
   * Whether SMS notifications are enabled
   */
  sms: boolean;
}

/**
 * Parameters for sending a notification through the unified notification system
 */
export interface SendNotificationParams {
  /**
   * User ID to send notification to
   */
  userId: string;

  /**
   * Notification type name (e.g., 'Agent Completion') or UUID
   */
  typeNameOrId: string;

  /**
   * Short notification title (used for in-app and email subject)
   */
  title: string;

  /**
   * Full notification message (used for in-app display)
   */
  message: string;

  /**
   * Optional resource type ID for linking notification to a specific resource
   */
  resourceTypeId?: string;

  /**
   * Optional resource record ID for linking notification to a specific record
   */
  resourceRecordId?: string;

  /**
   * Optional navigation context stored as JSON (conversation ID, artifact details, etc.)
   */
  resourceConfiguration?: any;

  /**
   * Data object for template rendering (email/SMS templates)
   */
  templateData?: Record<string, any>;

  /**
   * Force specific delivery channels, overriding user preferences and type defaults.
   * When specified, these channels are used instead of resolving from preferences.
   */
  forceDeliveryChannels?: DeliveryChannels;
}

/**
 * Result of sending a notification
 */
export interface NotificationResult {
  /**
   * Whether the notification operation succeeded overall
   */
  success: boolean;

  /**
   * ID of the created in-app notification (if created)
   */
  inAppNotificationId?: string;

  /**
   * Whether email was sent successfully
   */
  emailSent?: boolean;

  /**
   * Whether SMS was sent successfully
   */
  smsSent?: boolean;

  /**
   * Actual delivery channels used (after resolving preferences)
   */
  deliveryChannels: DeliveryChannels;

  /**
   * Any errors that occurred during notification delivery
   */
  errors?: string[];
}
