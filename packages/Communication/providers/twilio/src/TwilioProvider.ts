import {
  BaseCommunicationProvider,
  BaseMessageResult,
  CreateDraftParams,
  CreateDraftResult,
  CreateSubscriptionParams,
  DeleteSubscriptionParams,
  ForwardMessageParams,
  ForwardMessageResult,
  GetMessageMessage,
  GetMessagesParams,
  GetMessagesResult,
  MessageResult,
  NormalizedNotification,
  ParseNotificationResult,
  ProcessedMessage,
  ProviderCredentialsBase,
  ReplyToMessageParams,
  ReplyToMessageResult,
  resolveCredentialValue,
  SubscriptionCapabilities,
  SubscriptionResult,
  validateRequiredCredentials,
  WebhookNotificationInput,
  ProviderOperation
} from "@memberjunction/communication-types";
import { RegisterClass, MJLruCache } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import twilio, { Twilio } from 'twilio';
import * as Config from "./config";

/**
 * Credentials for Twilio provider.
 * Extend ProviderCredentialsBase to support per-request credential override.
 *
 * @remarks
 * **TEMPORARY INTERFACE**: This interface is part of the interim credential solution for 2.x patch release.
 * In a future release, this will be integrated with the comprehensive credential management system.
 */
export interface TwilioCredentials extends ProviderCredentialsBase {
  /** Twilio Account SID */
  accountSid?: string;
  /** Twilio Auth Token */
  authToken?: string;
  /** Twilio Phone Number for SMS */
  phoneNumber?: string;
  /** Optional WhatsApp number (if using WhatsApp messaging) */
  whatsappNumber?: string;
  /** Optional Facebook Page ID (if using Facebook Messenger) */
  facebookPageId?: string;
}

/**
 * Resolved Twilio credentials after merging request credentials with environment fallback
 */
interface ResolvedTwilioCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  whatsappNumber: string;
  facebookPageId: string;
}

/**
 * Implementation of the Twilio provider for sending and receiving messages (SMS, WhatsApp, Facebook Messenger)
 */
@RegisterClass(BaseCommunicationProvider, 'Twilio')
export class TwilioProvider extends BaseCommunicationProvider {
  /** Cached Twilio client for environment credentials */
  private envTwilioClient: Twilio | null = null;

  /**
   * Cache of Twilio clients keyed by accountSid for per-request credentials.
   * Bounded LRU(100) + 1-hour TTL — prior unbounded `Map` retained credential-
   * derived clients indefinitely in multi-tenant deployments and effectively
   * pinned secrets in memory past their useful life. See audit R2-C3.
   */
  private clientCache: MJLruCache<string, Twilio> = new MJLruCache<string, Twilio>({
    maxSize: 100,
    ttlMs: 60 * 60 * 1000,
  });

  /**
   * Returns the list of operations supported by the Twilio provider.
   * Twilio is a messaging provider (SMS, WhatsApp, Messenger) and does not support
   * mailbox operations like folders, archiving, or attachments.
   */
  public override getSupportedOperations(): ProviderOperation[] {
    return [
      'SendSingleMessage',
      'GetMessages',
      'ForwardMessage',
      'ReplyToMessage',
      // Push-notification subscriptions (inbound-parse mode). Twilio's "subscription" is
      // pointing a phone number's inbound SMS webhook at the consumer's URL. Webhooks never
      // expire, so RenewSubscription is intentionally NOT supported.
      'CreateSubscription',
      'DeleteSubscription',
      'ParseNotification'
      // Note: CreateDraft is NOT supported - Twilio is real-time messaging only
      // Note: RenewSubscription is NOT supported - Twilio webhooks never expire
      // Mailbox operations (folders, archive, attachments) are not applicable to SMS/messaging
    ];
  }

  /**
   * Resolves credentials by merging request credentials with environment fallback
   */
  private resolveCredentials(credentials?: TwilioCredentials): ResolvedTwilioCredentials {
    const disableFallback = credentials?.disableEnvironmentFallback ?? false;

    const accountSid = resolveCredentialValue(credentials?.accountSid, Config.TWILIO_ACCOUNT_SID, disableFallback);
    const authToken = resolveCredentialValue(credentials?.authToken, Config.TWILIO_AUTH_TOKEN, disableFallback);
    const phoneNumber = resolveCredentialValue(credentials?.phoneNumber, Config.TWILIO_PHONE_NUMBER, disableFallback);
    const whatsappNumber = resolveCredentialValue(credentials?.whatsappNumber, Config.TWILIO_WHATSAPP_NUMBER, disableFallback);
    const facebookPageId = resolveCredentialValue(credentials?.facebookPageId, Config.TWILIO_FACEBOOK_PAGE_ID, disableFallback);

    // Validate required credentials
    validateRequiredCredentials(
      { accountSid, authToken, phoneNumber },
      ['accountSid', 'authToken', 'phoneNumber'],
      'Twilio'
    );

    return {
      accountSid: accountSid!,
      authToken: authToken!,
      phoneNumber: phoneNumber!,
      whatsappNumber: whatsappNumber || '',
      facebookPageId: facebookPageId || ''
    };
  }

  /**
   * Gets a Twilio client for the given credentials, using caching for efficiency
   */
  private getTwilioClient(creds: ResolvedTwilioCredentials): Twilio {
    // Check if using environment credentials (can use shared client)
    const isEnvCredentials =
      creds.accountSid === Config.TWILIO_ACCOUNT_SID &&
      creds.authToken === Config.TWILIO_AUTH_TOKEN;

    if (isEnvCredentials) {
      if (!this.envTwilioClient) {
        this.envTwilioClient = twilio(creds.accountSid, creds.authToken);
      }
      return this.envTwilioClient;
    }

    // For per-request credentials, use cached client by credential key
    const cacheKey = `${creds.accountSid}`;
    let client = this.clientCache.Get(cacheKey);

    if (!client) {
      client = twilio(creds.accountSid, creds.authToken);
      this.clientCache.Set(cacheKey, client);
    }

    return client;
  }

  /**
   * Determine the message channel type based on recipient format
   */
  private getChannelType(to: string): 'sms' | 'whatsapp' | 'messenger' {
    if (to.startsWith('whatsapp:')) {
      return 'whatsapp';
    } else if (to.startsWith('messenger:')) {
      return 'messenger';
    } else {
      return 'sms';
    }
  }

  /**
   * Format the sender number/ID based on channel type and credentials
   */
  private formatFrom(channelType: 'sms' | 'whatsapp' | 'messenger', creds: ResolvedTwilioCredentials): string {
    switch (channelType) {
      case 'whatsapp':
        return creds.whatsappNumber ? `whatsapp:${creds.whatsappNumber}` : '';
      case 'messenger':
        return creds.facebookPageId ? `messenger:${creds.facebookPageId}` : '';
      case 'sms':
      default:
        return creds.phoneNumber;
    }
  }

  /**
   * Format the recipient number/ID if needed
   */
  private formatTo(to: string, channelType: 'sms' | 'whatsapp' | 'messenger'): string {
    // If already formatted with prefix, return as is
    if (to.startsWith('whatsapp:') || to.startsWith('messenger:')) {
      return to;
    }
    
    // Format based on channel type
    switch (channelType) {
      case 'whatsapp':
        return `whatsapp:${to}`;
      case 'messenger':
        return `messenger:${to}`;
      case 'sms':
      default:
        return to;
    }
  }

  /**
   * Sends a single message using Twilio
   * @param message - The message to send
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async SendSingleMessage(
    message: ProcessedMessage,
    credentials?: TwilioCredentials
  ): Promise<MessageResult> {
    try {
      if (!message.To) {
        return {
          Message: message,
          Success: false,
          Error: 'Recipient not specified'
        };
      }

      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const twilioClient = this.getTwilioClient(creds);

      // Determine channel type (SMS, WhatsApp, Messenger)
      const channelType = this.getChannelType(message.To);

      // Format sender and recipient
      const from = message.From || this.formatFrom(channelType, creds);
      const to = this.formatTo(message.To, channelType);

      // Ensure from is configured for this channel
      if (!from) {
        return {
          Message: message,
          Success: false,
          Error: `${channelType.toUpperCase()} sender not configured`
        };
      }

      // Prepare message body
      // For SMS and messaging channels, we use plain text
      // HTML is not supported, so we use the text body
      const body = message.ProcessedBody || '';

      // Optional media URLs if specified in context data
      const mediaUrls = message.ContextData?.mediaUrls as string[] || [];

      // DRY RUN: full pipeline ran (credential resolution/validation, channel detection,
      // from/to formatting, body + media assembly above) — stop at the transport boundary,
      // never calling the Twilio API.
      if (message.DryRun) {
        LogStatus(`[DryRun] Twilio: ${channelType.toUpperCase()} payload constructed for ${to} — external send skipped`);
        return {
          Message: message,
          Success: true,
          Error: '',
          DryRun: true
        };
      }

      // Send the message
      const result = await twilioClient.messages.create({
        body,
        from,
        to,
        ...(mediaUrls.length > 0 && { mediaUrl: mediaUrls })
      });

      LogStatus(`${channelType.toUpperCase()} message sent via Twilio (SID: ${result.sid})`);

      return {
        Message: message,
        Success: true,
        Error: ''
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error sending message';
      LogError('Error sending message via Twilio', undefined, error);
      return {
        Message: message,
        Success: false,
        Error: errorMessage
      };
    }
  }

  /**
   * Gets messages from Twilio
   * @param params - Parameters for fetching messages
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async GetMessages(
    params: GetMessagesParams,
    credentials?: TwilioCredentials
  ): Promise<GetMessagesResult> {
    try {
      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const twilioClient = this.getTwilioClient(creds);

      // Build query parameters
      const queryParams: Record<string, unknown> = {
        limit: params.NumMessages
      };

      // Filter by date sent
      if (params.ContextData?.dateSent) {
        queryParams.dateSent = params.ContextData.dateSent;
      }

      // Filter by sender
      if (params.ContextData?.from) {
        queryParams.from = params.ContextData.from;
      }

      // Filter by recipient
      queryParams.to = params.Identifier || params.ContextData?.to || undefined;

      // Fetch messages
      const messages = await twilioClient.messages.list(queryParams);

      // Format messages into standard structure
      const formattedMessages = messages.map((message) => {
        return {
          From: message.from || '',
          To: message.to || '',
          Body: message.body || '',
          ExternalSystemRecordID: message.sid,
          Subject: '', // SMS doesn't have subject
          ThreadID: message.sid // Using message SID as thread ID as Twilio doesn't have thread concept
        };
      });

      return {
        Success: true,
        Messages: formattedMessages,
        SourceData: messages
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error fetching messages';
      LogError('Error fetching messages from Twilio', undefined, error);
      return {
        Success: false,
        Messages: [],
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Reply to a message using Twilio
   * @param params - Parameters for replying to a message
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async ReplyToMessage(
    params: ReplyToMessageParams,
    credentials?: TwilioCredentials
  ): Promise<ReplyToMessageResult> {
    try {
      if (!params.MessageID) {
        return {
          Success: false,
          ErrorMessage: 'Message ID not provided'
        };
      }

      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const twilioClient = this.getTwilioClient(creds);

      // Get original message to determine recipient and channel
      const originalMessage = await twilioClient.messages(params.MessageID).fetch();

      if (!originalMessage) {
        return {
          Success: false,
          ErrorMessage: 'Original message not found'
        };
      }

      // The recipient of our reply is the sender of the original message
      const to = originalMessage.from || '';
      if (!to) {
        return {
          Success: false,
          ErrorMessage: 'Could not determine recipient for reply'
        };
      }

      // Determine channel type
      const channelType = this.getChannelType(to);

      // Format sender
      const from = params.Message.From || this.formatFrom(channelType, creds);

      // Prepare message content
      const body = params.Message.ProcessedBody || '';

      // Optional media URLs
      const mediaUrls = params.Message.ContextData?.mediaUrls as string[] || [];

      // Send the reply
      const result = await twilioClient.messages.create({
        body,
        from,
        to,
        ...(mediaUrls.length > 0 && { mediaUrl: mediaUrls })
      });

      return {
        Success: true,
        Result: result
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error replying to message';
      LogError('Error replying to message via Twilio', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Forward a message using Twilio
   * Note: Twilio doesn't have a native "forward" concept, so we implement it as a new message
   * that includes the content of the original message
   * @param params - Parameters for forwarding a message
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async ForwardMessage(
    params: ForwardMessageParams,
    credentials?: TwilioCredentials
  ): Promise<ForwardMessageResult> {
    try {
      if (!params.MessageID || !params.ToRecipients || params.ToRecipients.length === 0) {
        return {
          Success: false,
          ErrorMessage: 'Message ID or recipients not provided'
        };
      }

      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const twilioClient = this.getTwilioClient(creds);

      // Get the original message
      const originalMessage = await twilioClient.messages(params.MessageID).fetch();

      if (!originalMessage) {
        return {
          Success: false,
          ErrorMessage: 'Original message not found'
        };
      }

      // Create forwarded message content
      const forwardPrefix = 'Forwarded message:\n';
      const originalSender = `From: ${originalMessage.from}\n`;
      const originalContent = originalMessage.body || '';
      const forwardComment = params.Message ? `${params.Message}\n\n` : '';
      const body = `${forwardComment}${forwardPrefix}${originalSender}${originalContent}`;

      // Send to all recipients
      const results = await Promise.all(params.ToRecipients.map(async (recipient) => {
        const channelType = this.getChannelType(recipient);
        const from = this.formatFrom(channelType, creds);
        const to = this.formatTo(recipient, channelType);

        return twilioClient.messages.create({
          body,
          from,
          to,
          // If original had media, we can forward it
          ...(originalMessage.numMedia !== '0' && { mediaUrl: [originalMessage.uri] })
        });
      }));

      return {
        Success: true,
        Result: results
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error forwarding message';
      LogError('Error forwarding message via Twilio', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Twilio does not support creating draft messages
   * @param params - Parameters for creating a draft (not used)
   * @param credentials - Optional credentials (not used for Twilio)
   */
  public async CreateDraft(
    params: CreateDraftParams,
    credentials?: TwilioCredentials
  ): Promise<CreateDraftResult> {
    return {
      Success: false,
      ErrorMessage: 'Twilio does not support creating draft messages. Drafts are only supported by email providers with mailbox access (Gmail, MS Graph).'
    };
  }

  // ========================================================================
  // PUSH-NOTIFICATION SUBSCRIPTIONS (inbound-parse mode)
  //
  // Twilio has no "subscription" resource. Instead, each phone number owned by the
  // account carries an inbound-SMS webhook (`smsUrl`); Twilio POSTs an
  // application/x-www-form-urlencoded body carrying the FULL inbound message to that URL
  // whenever an SMS arrives. So a "subscription" here is simply pointing a number's
  // `smsUrl` at the consumer's endpoint, and "deleting" it is clearing that URL. These
  // registrations never expire — hence no RenewSubscription.
  //
  // AUTH NOTE: CreateSubscription/DeleteSubscription ride the account credentials (Account
  // SID + Auth Token) and require the target phone number to belong to that account.
  // ParseNotification verifies the inbound webhook's `X-Twilio-Signature` using the same
  // account Auth Token (the "Messaging webhook signature" secret).
  // ========================================================================

  /**
   * Detects whether a Twilio SDK error represents a not-found condition, treated as
   * success by the idempotent {@link DeleteSubscription}. Twilio surfaces this as HTTP
   * status 404 and/or Twilio error code 20404.
   */
  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const e = error as { status?: number; code?: number };
      return e.status === 404 || e.code === 20404;
    }
    return false;
  }

  /**
   * Resolves {@link CreateSubscriptionParams.Identifier} to a phone-number SID. An
   * identifier beginning with `PN` is already a SID and is returned verbatim (no network
   * call). Otherwise it is treated as an E.164 number and looked up via
   * `incomingPhoneNumbers.list`, returning the first matching number's SID or `null` when
   * the account owns no such number.
   */
  private async resolvePhoneNumberSid(client: Twilio, identifier: string): Promise<string | null> {
    if (identifier.startsWith('PN')) {
      return identifier;
    }
    const matches = await client.incomingPhoneNumbers.list({ phoneNumber: identifier, limit: 1 });
    return matches.length > 0 ? matches[0].sid : null;
  }

  /**
   * Points a phone number's inbound-SMS webhook (`smsUrl`) at the consumer's endpoint,
   * making Twilio deliver inbound SMS notifications there. The number must belong to the
   * authenticated account.
   *
   * Fail-fast: {@link CreateSubscriptionParams.NotificationUrl} must be https and
   * {@link CreateSubscriptionParams.Identifier} (an E.164 number like `+15551234567` or a
   * phone-number SID like `PN...`) must be provided.
   *
   * @param params - Identifier (target number/SID) and NotificationUrl (webhook target)
   * @param credentials - Optional account credentials override for this request
   * @returns Promise<SubscriptionResult> - SubscriptionID = the phone-number SID;
   *          ExpiresAt is undefined because Twilio webhooks never expire
   */
  public override async CreateSubscription(
    params: CreateSubscriptionParams,
    credentials?: TwilioCredentials
  ): Promise<SubscriptionResult> {
    // Fail-fast input validation (before any Twilio call).
    if (!params.Identifier) {
      return { Success: false, ErrorMessage: 'CreateSubscription requires an Identifier (an E.164 phone number or a phone-number SID)' };
    }
    if (!params.NotificationUrl || !params.NotificationUrl.toLowerCase().startsWith('https://')) {
      return { Success: false, ErrorMessage: 'NotificationUrl must be an https:// URL' };
    }

    try {
      const creds = this.resolveCredentials(credentials);
      const client = this.getTwilioClient(creds);

      const sid = await this.resolvePhoneNumberSid(client, params.Identifier);
      if (!sid) {
        return {
          Success: false,
          ErrorMessage: `No phone number matching '${params.Identifier}' found on this Twilio account`
        };
      }

      const result = await client.incomingPhoneNumbers(sid).update({
        smsUrl: params.NotificationUrl,
        smsMethod: 'POST'
      });

      return {
        Success: true,
        SubscriptionID: sid,
        ExpiresAt: undefined, // Twilio webhooks never expire
        Result: result
      };
    } catch (error: unknown) {
      LogError('Error creating subscription via Twilio', undefined, error);
      return {
        Success: false,
        ErrorMessage: `Error creating subscription: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Clears a phone number's inbound-SMS webhook, so Twilio stops delivering inbound SMS
   * notifications for it. Idempotent from the consumer's perspective: a not-found
   * (HTTP 404 / Twilio code 20404) is treated as success.
   *
   * @param params - SubscriptionID = the phone-number SID returned by CreateSubscription
   * @param credentials - Optional account credentials override for this request
   * @returns Promise<BaseMessageResult> - Result of the delete operation
   */
  public override async DeleteSubscription(
    params: DeleteSubscriptionParams,
    credentials?: TwilioCredentials
  ): Promise<BaseMessageResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const client = this.getTwilioClient(creds);
      await client.incomingPhoneNumbers(params.SubscriptionID).update({ smsUrl: '' });
      return { Success: true };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        // Already gone - deletion is idempotent from the consumer's perspective.
        return { Success: true };
      }
      LogError('Error deleting subscription via Twilio', undefined, error);
      return {
        Success: false,
        ErrorMessage: `Error deleting subscription: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Parses and verifies an inbound Twilio SMS webhook. Pure: no Twilio client, no network.
   * Safe on hostile/garbage input — never throws; returns `Success: false` with a 400
   * suggested status when the body cannot be parsed at all.
   *
   * Twilio posts `application/x-www-form-urlencoded`. The `X-Twilio-Signature` header is
   * verified via the SDK's `validateRequest(authToken, signature, url, params)` using the
   * account Auth Token (the "Messaging webhook signature" secret). The parsed notification
   * is ALWAYS returned even when the signature is invalid — the flag is set so the consumer
   * can decide — but an unparseable body is the 400 case.
   *
   * INLINE mode: the webhook carries the full message, so {@link NormalizedNotification.Message}
   * is populated and consumers need not re-fetch. `MessageSid` is also surfaced in
   * {@link NormalizedNotification.MessageIDs} as a still-useful pointer.
   *
   * @param input - Transport-neutral capture of the inbound webhook request
   * @param credentials - Optional account credentials override (for signature verification)
   * @returns Promise<ParseNotificationResult> - The normalized inbound message + signature outcome
   */
  public override async ParseNotification(
    input: WebhookNotificationInput,
    credentials?: TwilioCredentials
  ): Promise<ParseNotificationResult> {
    // Parse the urlencoded body. Never throw on bad input.
    let params: Record<string, string>;
    try {
      if (!input?.RawBody) {
        throw new Error('empty body');
      }
      params = Object.fromEntries(new URLSearchParams(input.RawBody));
      if (Object.keys(params).length === 0) {
        throw new Error('no parameters parsed from body');
      }
    } catch (error: unknown) {
      return {
        Success: false,
        ErrorMessage: `Malformed Twilio notification body: ${error instanceof Error ? error.message : String(error)}`,
        Notifications: [],
        SuggestedResponseStatus: 400
      };
    }

    // Verify the Twilio signature (pure crypto, no network). Resolve the account Auth Token
    // for the HMAC secret; on missing/invalid credentials treat the signature as invalid
    // rather than throwing — the notification is still returned for the consumer to judge.
    let signatureValid = false;
    try {
      const creds = this.resolveCredentials(credentials);
      const signatureHeader = input.Headers?.['x-twilio-signature'] ?? '';
      const url = input.RequestUrl ?? '';
      signatureValid = twilio.validateRequest(creds.authToken, signatureHeader, url, params);
    } catch (error: unknown) {
      LogError('Error verifying Twilio signature', undefined, error);
      signatureValid = false;
    }

    const message: GetMessageMessage = {
      From: params.From ?? '',
      To: params.To ?? '',
      Body: params.Body ?? ''
    };

    const notification: NormalizedNotification = {
      Kind: 'message',
      ChangeType: 'created',
      MessageIDs: params.MessageSid ? [params.MessageSid] : [],
      Identifier: params.To,
      Message: message, // INLINE payload
      RawData: params
    };

    return {
      Success: true,
      SignatureValid: signatureValid,
      Notifications: [notification],
      SuggestedResponseStatus: 200
    };
  }

  /**
   * Returns Twilio's subscription capabilities. Twilio is an INLINE-payload, inbound-parse
   * provider: webhooks never expire (no renewal), only `created` notifications are
   * delivered, no endpoint-validation handshake is performed, management is supported
   * (pointing/clearing a number's `smsUrl`), and the full message is delivered inline.
   */
  public override getSubscriptionCapabilities(): SubscriptionCapabilities {
    return {
      MaxLifetimeMinutes: undefined, // Twilio webhooks never expire
      SupportedChangeTypes: ['created'],
      RequiresEndpointValidation: false,
      SupportsSubscriptionManagement: true,
      DeliversPayloadInline: true
    };
  }
}