import { UUIDsEqual } from '@memberjunction/global';
import {
  AppliedMessageFilters,
  BaseCommunicationProvider,
  CombineFilterClauses,
  MessageRetrievalCapabilities,
  CreateDraftParams,
  CreateDraftResult,
  ForwardMessageParams,
  ForwardMessageResult,
  GetMessageMessage,
  GetMessagesParams,
  GetMessagesResult,
  MessageResult,
  ProcessedMessage,
  ProviderCredentialsBase,
  ReplyToMessageParams,
  ReplyToMessageResult,
  ParseEmailAddressList,
  resolveCredentialValue,
  validateRequiredCredentials,
  ProviderOperation,
  GetSingleMessageParams,
  GetSingleMessageResult,
  DeleteMessageParams,
  DeleteMessageResult,
  MoveMessageParams,
  MoveMessageResult,
  ListFoldersParams,
  ListFoldersResult,
  MessageFolder,
  MarkAsReadParams,
  MarkAsReadResult,
  ArchiveMessageParams,
  ArchiveMessageResult,
  SearchMessagesParams,
  SearchMessagesResult,
  ListAttachmentsParams,
  ListAttachmentsResult,
  MessageAttachment,
  DownloadAttachmentParams,
  DownloadAttachmentResult,
  CreateSubscriptionParams,
  RenewSubscriptionParams,
  DeleteSubscriptionParams,
  SubscriptionResult,
  SubscriptionCapabilities,
  WebhookNotificationInput,
  NormalizedNotification,
  ParseNotificationResult,
  BaseMessageResult
} from "@memberjunction/communication-types";
import { RegisterClass, MJLruCache } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import * as Config from "./config";
import googleApis from 'googleapis';

/**
 * Credentials for Gmail provider using OAuth2.
 * Extend ProviderCredentialsBase to support per-request credential override.
 *
 * @remarks
 * **TEMPORARY INTERFACE**: This interface is part of the interim credential solution for 2.x patch release.
 * In a future release, this will be integrated with the comprehensive credential management system.
 */
export interface GmailCredentials extends ProviderCredentialsBase {
  /** Google OAuth2 Client ID */
  clientId?: string;
  /** Google OAuth2 Client Secret */
  clientSecret?: string;
  /** OAuth2 Redirect URI */
  redirectUri?: string;
  /** OAuth2 Refresh Token */
  refreshToken?: string;
  /** Service account email (optional) */
  serviceAccountEmail?: string;
}

/**
 * Resolved Gmail credentials after merging request credentials with environment fallback
 */
interface ResolvedGmailCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
  serviceAccountEmail: string;
}

/**
 * Cached Gmail client with associated user email
 */
interface CachedGmailClient {
  client: googleApis.gmail_v1.Gmail;
  userEmail: string | null;
}

/**
 * Gmail's mailbox watch (a `users.watch` registration) expires after roughly 7 days,
 * so the consumer MUST re-watch before then. Expressed in minutes (7 × 24 × 60) to match
 * {@link SubscriptionCapabilities.MaxLifetimeMinutes}.
 */
const GMAIL_MAX_SUBSCRIPTION_MINUTES = 10080;

/**
 * Provider-specific extras for a Gmail push subscription, passed via
 * {@link CreateSubscriptionParams.ContextData} / {@link RenewSubscriptionParams.ContextData}.
 */
interface GmailSubscriptionContext {
  /**
   * The fully-qualified Google Cloud Pub/Sub topic the mailbox watch publishes to, e.g.
   * `projects/{project}/topics/{topic}`. REQUIRED - Gmail delivers push via Pub/Sub, not
   * an HTTP endpoint.
   */
  topicName?: string;
  /**
   * Label IDs to restrict the watch to. Defaults to `['INBOX']`.
   */
  labelIds?: string[];
  /**
   * Whether {@link GmailSubscriptionContext.labelIds} are an allow-list (`'include'`) or a
   * deny-list (`'exclude'`). Passed through to Gmail verbatim when set.
   */
  labelFilterBehavior?: string;
}

/**
 * The JSON payload Gmail base64-encodes into the Pub/Sub `message.data` field.
 */
interface GmailPushData {
  emailAddress?: string;
  historyId?: string | number;
}

/**
 * Implementation of the Gmail provider for sending and receiving messages
 */
/**
 * Gmail's `after:` / `before:` accept epoch SECONDS as well as `YYYY/MM/DD`. Seconds are used
 * deliberately: the date form is day-granular in the mailbox's own timezone, which would move an
 * instant-based bound by up to a day without saying so.
 *
 * Both operators are EXCLUSIVE, while `ReceivedAfter` / `ReceivedBefore` are documented as
 * inclusive. Each bound is therefore widened by one second so the boundary message is returned
 * rather than dropped. That errs toward returning one extra message, which a caller de-duplicates;
 * the opposite error loses mail silently, which it cannot detect at all.
 */
function GmailBoundSeconds(when: Date, bound: 'after' | 'before'): number {
  const seconds = Math.floor(when.getTime() / 1000);
  return bound === 'after' ? seconds - 1 : seconds + 1;
}

@RegisterClass(BaseCommunicationProvider, 'Gmail')
export class GmailProvider extends BaseCommunicationProvider {
  /**
   * Gmail filters both server-side via search operators, so neither is emulated here. Note the date
   * bound is approximate at second granularity — see `GmailBoundSeconds`.
   */
  public override get MessageRetrieval(): MessageRetrievalCapabilities {
    return { FilterByReceivedDate: true, FilterByUnread: true };
  }

  /** Cached Gmail client for environment credentials */
  private envGmailClient: CachedGmailClient | null = null;

  /**
   * Cache of Gmail clients keyed by clientId + refresh-token-prefix. Bounded
   * LRU(100) + 1-hour TTL — prior unbounded `Map` retained credential-derived
   * OAuth2 clients (and refresh-token fragments) indefinitely. See audit R2-C3.
   */
  private clientCache: MJLruCache<string, CachedGmailClient> = new MJLruCache<string, CachedGmailClient>({
    maxSize: 100,
    ttlMs: 60 * 60 * 1000,
  });

  /**
   * Resolves credentials by merging request credentials with environment fallback
   */
  private resolveCredentials(credentials?: GmailCredentials): ResolvedGmailCredentials {
    const disableFallback = credentials?.disableEnvironmentFallback ?? false;

    const clientId = resolveCredentialValue(credentials?.clientId, Config.GMAIL_CLIENT_ID, disableFallback);
    const clientSecret = resolveCredentialValue(credentials?.clientSecret, Config.GMAIL_CLIENT_SECRET, disableFallback);
    const redirectUri = resolveCredentialValue(credentials?.redirectUri, Config.GMAIL_REDIRECT_URI, disableFallback);
    const refreshToken = resolveCredentialValue(credentials?.refreshToken, Config.GMAIL_REFRESH_TOKEN, disableFallback);
    const serviceAccountEmail = resolveCredentialValue(credentials?.serviceAccountEmail, Config.GMAIL_SERVICE_ACCOUNT_EMAIL, disableFallback);

    // Validate required credentials
    validateRequiredCredentials(
      { clientId, clientSecret, redirectUri, refreshToken },
      ['clientId', 'clientSecret', 'redirectUri', 'refreshToken'],
      'Gmail'
    );

    return {
      clientId: clientId!,
      clientSecret: clientSecret!,
      redirectUri: redirectUri!,
      refreshToken: refreshToken!,
      serviceAccountEmail: serviceAccountEmail || ''
    };
  }

  /**
   * Creates a Gmail client with the given credentials
   */
  private createGmailClient(creds: ResolvedGmailCredentials): googleApis.gmail_v1.Gmail {
    // Create OAuth2 client
    const oauth2Client = new googleApis.google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri
    );

    // Set refresh token to automatically refresh access tokens
    oauth2Client.setCredentials({
      refresh_token: creds.refreshToken
    });

    // Create Gmail API client
    return googleApis.google.gmail({
      version: 'v1',
      auth: oauth2Client
    });
  }

  /**
   * Gets a Gmail client for the given credentials, using caching for efficiency
   */
  private getGmailClient(creds: ResolvedGmailCredentials): CachedGmailClient {
    // Check if using environment credentials (can use shared client)
    const isEnvCredentials =
      creds.clientId === Config.GMAIL_CLIENT_ID &&
      creds.clientSecret === Config.GMAIL_CLIENT_SECRET &&
      creds.refreshToken === Config.GMAIL_REFRESH_TOKEN;

    if (isEnvCredentials) {
      if (!this.envGmailClient) {
        this.envGmailClient = {
          client: this.createGmailClient(creds),
          userEmail: null
        };
      }
      return this.envGmailClient;
    }

    // For per-request credentials, use cached client by credential key
    const cacheKey = `${creds.clientId}:${creds.refreshToken.substring(0, 10)}`;
    let cached = this.clientCache.Get(cacheKey);

    if (!cached) {
      cached = {
        client: this.createGmailClient(creds),
        userEmail: null
      };
      this.clientCache.Set(cacheKey, cached);
    }

    return cached;
  }

  /**
   * Gets the authenticated user's email address for a given cached client
   */
  private async getUserEmail(cached: CachedGmailClient): Promise<string | null> {
    if (cached.userEmail) {
      return cached.userEmail;
    }

    try {
      // Get user profile to verify authentication
      const response = await cached.client.users.getProfile({
        userId: 'me'
      });

      if (response.data && response.data.emailAddress) {
        cached.userEmail = response.data.emailAddress;
        return cached.userEmail;
      }
      return null;
    } catch (error: unknown) {
      LogError('Failed to get Gmail user email', undefined, error);
      return null;
    }
  }

  /**
   * SECURITY: strips CR/LF from a value before it is interpolated into an RFC-2822
   * header line. Without this, a caller-controlled To/Cc/Bcc/Subject/From containing
   * "\r\n" injects arbitrary additional headers (or body content) into the raw message.
   */
  private sanitizeHeaderValue(value: string | null | undefined): string {
    if (!value) return '';
    return String(value).replace(/[\r\n]+/g, ' ');
  }

  /**
   * Encode and format email content for Gmail API
   */
  private createEmailContent(message: ProcessedMessage, creds: ResolvedGmailCredentials): string {
    // Get sender email — sanitize every header value against CRLF header injection
    const from = this.sanitizeHeaderValue(message.From || creds.serviceAccountEmail);
    const fromName = this.sanitizeHeaderValue(message.FromName);
    const fromHeader = fromName ? `${fromName} <${from}>` : from;

    // Create email content
    const subject = this.sanitizeHeaderValue(message.ProcessedSubject);
    const to = this.sanitizeHeaderValue(message.To);
    const cc = this.sanitizeHeaderValue(message.CCRecipients?.join(', '));
    const bcc = this.sanitizeHeaderValue(message.BCCRecipients?.join(', '));
    
    // Headers
    let emailContent = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${subject}`
    ];
    
    // Add CC and BCC if present
    if (cc) emailContent.push(`Cc: ${cc}`);
    if (bcc) emailContent.push(`Bcc: ${bcc}`);
    
    // Add content type and message body
    if (message.ProcessedHTMLBody) {
      // For HTML emails
      const boundary = `boundary_${Math.random().toString(36).substring(2)}`;
      emailContent.push('MIME-Version: 1.0');
      emailContent.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      emailContent.push('');
      
      // Text part
      emailContent.push(`--${boundary}`);
      emailContent.push('Content-Type: text/plain; charset=UTF-8');
      emailContent.push('');
      emailContent.push(message.ProcessedBody || '');
      emailContent.push('');
      
      // HTML part
      emailContent.push(`--${boundary}`);
      emailContent.push('Content-Type: text/html; charset=UTF-8');
      emailContent.push('');
      emailContent.push(message.ProcessedHTMLBody);
      emailContent.push('');
      
      emailContent.push(`--${boundary}--`);
    } else {
      // Plain text email
      emailContent.push('Content-Type: text/plain; charset=UTF-8');
      emailContent.push('');
      emailContent.push(message.ProcessedBody || '');
    }
    
    return Buffer.from(emailContent.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Sends a single message using the Gmail API
   * @param message - The message to send
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async SendSingleMessage(
    message: ProcessedMessage,
    credentials?: GmailCredentials
  ): Promise<MessageResult> {
    try {
      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // DRY RUN: run the full local pipeline (credential resolution/validation, OAuth2 client
      // construction, complete base64url RFC-2822 payload construction) but NEVER contact Google —
      // which is why the getUserEmail() profile round-trip below is also skipped on this path.
      if (message.DryRun) {
        this.createEmailContent(message, creds);
        LogStatus(`[DryRun] Gmail: raw RFC-2822 payload constructed for ${message.To} — external send skipped`);
        return {
          Message: message,
          Success: true,
          Error: '',
          DryRun: true
        };
      }

      // Get user email
      const userEmail = await this.getUserEmail(cached);
      if (!userEmail) {
        return {
          Message: message,
          Success: false,
          Error: 'Could not get user email'
        };
      }

      // Create raw email content in base64 URL-safe format
      const raw = this.createEmailContent(message, creds);

      // Send the email
      const result = await cached.client.users.messages.send({
        userId: 'me',
        requestBody: {
          raw
        }
      });

      if (result && result.status >= 200 && result.status < 300) {
        LogStatus(`Email sent via Gmail: ${result.statusText}`);
        return {
          Message: message,
          Success: true,
          Error: ''
        };
      } else {
        LogError('Failed to send email via Gmail', undefined, result);
        return {
          Message: message,
          Success: false,
          Error: `Failed to send email: ${result?.statusText || 'Unknown error'}`
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error sending message';
      LogError('Error sending message via Gmail', undefined, error);
      return {
        Message: message,
        Success: false,
        Error: errorMessage
      };
    }
  }

  /**
   * Gets messages from Gmail
   * @param params - Parameters for fetching messages
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async GetMessages(
    params: GetMessagesParams,
    credentials?: GmailCredentials
  ): Promise<GetMessagesResult> {
    try {
      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      const userEmail = await this.getUserEmail(cached);
      if (!userEmail) {
        return {
          Success: false,
          Messages: [],
          ErrorMessage: 'Could not get user email'
        };
      }

      // Build query. COMPOSED, not assigned. The ContextData branch below used to overwrite the
      // whole query, so a caller passing it alongside UnreadOnly silently got read mail back. Every
      // term now narrows: Gmail joins search terms with an implicit AND, hence the space operator.
      const applied: AppliedMessageFilters = { ReceivedAfter: false, ReceivedBefore: false, UnreadOnly: false };
      const clauses: string[] = [];

      if (params.UnreadOnly) {
        clauses.push('is:unread');
        applied.UnreadOnly = true;
      }

      if (params.ReceivedAfter) {
        clauses.push(`after:${GmailBoundSeconds(params.ReceivedAfter, 'after')}`);
        applied.ReceivedAfter = true;
      }

      if (params.ReceivedBefore) {
        clauses.push(`before:${GmailBoundSeconds(params.ReceivedBefore, 'before')}`);
        applied.ReceivedBefore = true;
      }

      if (params.ContextData?.query) {
        clauses.push(String(params.ContextData.query));
      }

      const query: string = CombineFilterClauses(clauses, ' ');

      // Get messages
      const response = await cached.client.users.messages.list({
        userId: 'me',
        maxResults: params.NumMessages,
        q: query
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        // AppliedFilters belongs on the EMPTY result too. Zero messages is precisely when a caller
        // cannot tell "the narrowing worked and nothing matched" from "the narrowing was ignored
        // and the mailbox is empty", so omitting it here would defeat the field's whole purpose.
        return {
          Success: true,
          Messages: [],
          AppliedFilters: applied
        };
      }

      // Get full message details for each message ID
      const messagePromises = response.data.messages.map(async (message) => {
        const fullMessage = await cached.client.users.messages.get({
          userId: 'me',
          id: message.id || '',
          format: 'full'
        });

        return fullMessage.data;
      });

      const fullMessages = await Promise.all(messagePromises);

      // Process messages into standard format
      const processedMessages: GetMessageMessage[] = fullMessages.map(message => {
        // Extract headers
        const headers = message.payload?.headers || [];
        const getHeader = (name: string) => {
          const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
          return header ? header.value : '';
        };

        const from = getHeader('from');
        const to = getHeader('to');
        const subject = getHeader('subject');
        const replyTo = getHeader('reply-to') ? [getHeader('reply-to')] : [from];

        // Extract body by recursively walking the full MIME tree (handles
        // embedded images, multipart/alternative, and HTML-only messages).
        const body = this.extractBody(message.payload);

        return {
          From: from || '',
          To: to || '',
          ToRecipients: ParseEmailAddressList(to),
          CCRecipients: ParseEmailAddressList(getHeader('cc')),
          ReplyTo: replyTo.map(r => r || ''),
          Subject: subject || '',
          Body: body,
          ExternalSystemRecordID: message.id || '',
          ThreadID: message.threadId || ''
        };
      });

      // Mark as read if requested
      if (params.ContextData?.MarkAsRead) {
        for (const message of fullMessages) {
          if (message.id) {
            await this.markMessageAsRead(cached.client, message.id);
          }
        }
      }

      return {
        Success: true,
        Messages: processedMessages,
        SourceData: fullMessages,
        AppliedFilters: applied
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error getting messages';
      LogError('Error getting messages from Gmail', undefined, error);
      return {
        Success: false,
        Messages: [],
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Reply to a message using Gmail API
   * @param params - Parameters for replying to a message
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async ReplyToMessage(
    params: ReplyToMessageParams,
    credentials?: GmailCredentials
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
      const cached = this.getGmailClient(creds);

      // Get the original message to obtain threadId
      const originalMessage = await cached.client.users.messages.get({
        userId: 'me',
        id: params.MessageID
      });

      if (!originalMessage.data.threadId) {
        return {
          Success: false,
          ErrorMessage: 'Could not get thread ID from original message'
        };
      }

      // Create raw email content
      const raw = this.createEmailContent(params.Message, creds);

      // Send the reply in the same thread
      const result = await cached.client.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: originalMessage.data.threadId
        }
      });

      if (result && result.status >= 200 && result.status < 300) {
        return {
          Success: true,
          Result: result.data
        };
      } else {
        return {
          Success: false,
          ErrorMessage: `Failed to reply to message: ${result?.statusText || 'Unknown error'}`
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error replying to message';
      LogError('Error replying to message via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Forward a message using Gmail API
   * @param params - Parameters for forwarding a message
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async ForwardMessage(
    params: ForwardMessageParams,
    credentials?: GmailCredentials
  ): Promise<ForwardMessageResult> {
    try {
      if (!params.MessageID) {
        return {
          Success: false,
          ErrorMessage: 'Message ID not provided'
        };
      }

      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // Get the original message
      const originalMessage = await cached.client.users.messages.get({
        userId: 'me',
        id: params.MessageID,
        format: 'raw'
      });

      if (!originalMessage.data.raw) {
        return {
          Success: false,
          ErrorMessage: 'Could not get raw content of original message'
        };
      }

      // Convert raw message to proper format
      const rawContent = Buffer.from(originalMessage.data.raw, 'base64').toString('utf-8');

      // Build forwarded message — sanitize every header value against CRLF header injection
      const userEmail = this.sanitizeHeaderValue(await this.getUserEmail(cached));
      const to = this.sanitizeHeaderValue(params.ToRecipients.join(', '));
      const cc = this.sanitizeHeaderValue(params.CCRecipients?.join(', '));
      const bcc = this.sanitizeHeaderValue(params.BCCRecipients?.join(', '));

      // Parse the original email to extract subject
      const subjectMatch = rawContent.match(/Subject: (.*?)(\r?\n)/);
      const subject = this.sanitizeHeaderValue(subjectMatch ? `Fwd: ${subjectMatch[1]}` : 'Fwd: ');

      // Headers for new message
      const emailContent = [
        `From: ${userEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`
      ];

      // Add CC and BCC if present
      if (cc) emailContent.push(`Cc: ${cc}`);
      if (bcc) emailContent.push(`Bcc: ${bcc}`);

      // Add content type
      const boundary = `boundary_${Math.random().toString(36).substring(2)}`;
      emailContent.push('MIME-Version: 1.0');
      emailContent.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      emailContent.push('');

      // Forward comment
      if (params.Message) {
        emailContent.push(`--${boundary}`);
        emailContent.push('Content-Type: text/plain; charset=UTF-8');
        emailContent.push('');
        emailContent.push(params.Message);
        emailContent.push('');
      }

      // Original message as attachment
      emailContent.push(`--${boundary}`);
      emailContent.push('Content-Type: message/rfc822; name="forwarded_message.eml"');
      emailContent.push('Content-Disposition: attachment; filename="forwarded_message.eml"');
      emailContent.push('');
      emailContent.push(rawContent);
      emailContent.push('');

      emailContent.push(`--${boundary}--`);

      // Encode email content
      const raw = Buffer.from(emailContent.join('\r\n')).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send the forwarded message
      const result = await cached.client.users.messages.send({
        userId: 'me',
        requestBody: {
          raw
        }
      });

      if (result && result.status >= 200 && result.status < 300) {
        return {
          Success: true,
          Result: result.data
        };
      } else {
        return {
          Success: false,
          ErrorMessage: `Failed to forward message: ${result?.statusText || 'Unknown error'}`
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error forwarding message';
      LogError('Error forwarding message via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Helper to mark a message as read
   */
  private async markMessageAsRead(gmailClient: googleApis.gmail_v1.Gmail, messageId: string): Promise<boolean> {
    try {
      await gmailClient.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
      return true;
    } catch (error: unknown) {
      LogError(`Error marking message ${messageId} as read`, undefined, error);
      return false;
    }
  }

  /**
   * Creates a draft message in Gmail
   * @param params - Parameters for creating a draft
   * @param credentials - Optional credentials override for this request.
   *                      If not provided, uses environment variables.
   *                      Set `credentials.disableEnvironmentFallback = true` to require explicit credentials.
   */
  public async CreateDraft(
    params: CreateDraftParams,
    credentials?: GmailCredentials
  ): Promise<CreateDraftResult> {
    try {
      // Resolve credentials (request credentials with env fallback)
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      const userEmail = await this.getUserEmail(cached);
      if (!userEmail) {
        return {
          Success: false,
          ErrorMessage: 'Could not get user email'
        };
      }

      // Reuse existing email content creation logic
      const raw = this.createEmailContent(params.Message, creds);

      // Create draft using Gmail API
      const result = await cached.client.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw }
        }
      });

      if (result && result.status >= 200 && result.status < 300) {
        LogStatus(`Draft created via Gmail: ${result.data.id}`);
        return {
          Success: true,
          DraftID: result.data.id || undefined,
          Result: result.data
        };
      } else {
        LogError('Failed to create draft via Gmail', undefined, result);
        return {
          Success: false,
          ErrorMessage: `Failed to create draft: ${result?.statusText || 'Unknown error'}`
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error creating draft';
      LogError('Error creating draft via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  // ========================================================================
  // EXTENDED OPERATIONS - Gmail supports all mailbox operations via labels
  // ========================================================================

  /**
   * Returns the list of operations supported by the Gmail provider.
   * Gmail supports all operations through its label-based system.
   */
  public override getSupportedOperations(): ProviderOperation[] {
    return [
      'SendSingleMessage',
      'GetMessages',
      'GetSingleMessage',
      'ForwardMessage',
      'ReplyToMessage',
      'CreateDraft',
      'DeleteMessage',
      'MoveMessage',
      'ListFolders',       // Gmail uses labels instead of folders
      'MarkAsRead',
      'ArchiveMessage',
      'SearchMessages',
      'ListAttachments',
      'DownloadAttachment',
      'CreateSubscription',
      'RenewSubscription',
      'DeleteSubscription',
      'ParseNotification'
    ];
  }

  // ========================================================================
  // PUSH-NOTIFICATION SUBSCRIPTIONS
  // Gmail is SUBSCRIPTION-MANAGED and HINT-mode. A mailbox `users.watch` registration
  // tells Gmail to publish change notifications to a Google Cloud Pub/Sub topic; the
  // push body carries only a historyId, so the consumer re-fetches changed messages via
  // GetMessages/the Gmail history API — the content is NEVER delivered inline. The
  // provider stays stateless: the consumer persists the mailbox userId + expiration.
  //
  // Pub/Sub prerequisite (document, not implemented): the target topic MUST grant the
  // `pubsub.publisher` role to `gmail-api-push@system.gserviceaccount.com`, or `users.watch`
  // fails. See https://developers.google.com/gmail/api/guides/push.
  // ========================================================================

  /**
   * Creates a Gmail mailbox watch so change notifications are published to a Google Cloud
   * Pub/Sub topic. Gmail delivers via Pub/Sub (not an HTTP endpoint), so
   * {@link CreateSubscriptionParams.NotificationUrl} is NOT required here.
   *
   * @requires Gmail API scope: https://www.googleapis.com/auth/gmail.readonly (or broader,
   *           e.g. gmail.modify).
   * @requires The Pub/Sub topic named in `ContextData.topicName` must grant publish rights
   *           to `gmail-api-push@system.gserviceaccount.com`.
   * @param params - What to watch; `ContextData.topicName` (Pub/Sub topic) is REQUIRED
   * @param credentials - Optional credentials override for this request
   * @returns Promise<SubscriptionResult> - The mailbox userId (as SubscriptionID) and expiration
   */
  public override async CreateSubscription(
    params: CreateSubscriptionParams,
    credentials?: GmailCredentials
  ): Promise<SubscriptionResult> {
    const context = params.ContextData as GmailSubscriptionContext | undefined;

    // Fail-fast input validation (before any Gmail call). Gmail push requires a Pub/Sub
    // topic; there is no HTTP endpoint, so NotificationUrl is intentionally NOT required.
    if (!context?.topicName) {
      return { Success: false, ErrorMessage: 'CreateSubscription requires a Pub/Sub topic in ContextData.topicName (e.g. projects/{project}/topics/{topic})' };
    }

    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);
      const userId = params.Identifier || 'me';

      return await this.issueWatch(cached.client, userId, context);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error creating subscription';
      LogError('Error creating subscription via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: `Error creating subscription: ${errorMessage}`
      };
    }
  }

  /**
   * Renews a Gmail mailbox watch by re-issuing `users.watch` for the same mailbox. Gmail
   * has no distinct renewal call — re-watching before the ~7-day expiry is the renewal.
   *
   * @requires Gmail API scope: https://www.googleapis.com/auth/gmail.readonly (or broader).
   * @param params - `SubscriptionID` is the mailbox userId; `ContextData.topicName` is REQUIRED
   * @param credentials - Optional credentials override for this request
   * @returns Promise<SubscriptionResult> - The mailbox userId (as SubscriptionID) and new expiration
   */
  public override async RenewSubscription(
    params: RenewSubscriptionParams,
    credentials?: GmailCredentials
  ): Promise<SubscriptionResult> {
    const context = params.ContextData as GmailSubscriptionContext | undefined;

    if (!context?.topicName) {
      return { Success: false, ErrorMessage: 'RenewSubscription requires a Pub/Sub topic in ContextData.topicName (e.g. projects/{project}/topics/{topic})' };
    }

    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);
      return await this.issueWatch(cached.client, params.SubscriptionID, context);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error renewing subscription';
      LogError('Error renewing subscription via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: `Error renewing subscription: ${errorMessage}`
      };
    }
  }

  /**
   * Stops the Gmail mailbox watch (`users.stop`). Idempotent from the consumer's
   * perspective: a 404 / not-found is treated as success.
   *
   * @requires Gmail API scope: https://www.googleapis.com/auth/gmail.readonly (or broader).
   * @param params - `SubscriptionID` is the mailbox userId whose watch to stop
   * @param credentials - Optional credentials override for this request
   * @returns Promise<BaseMessageResult> - Result of the stop operation
   */
  public override async DeleteSubscription(
    params: DeleteSubscriptionParams,
    credentials?: GmailCredentials
  ): Promise<BaseMessageResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);
      await cached.client.users.stop({ userId: params.SubscriptionID });
      LogStatus(`Gmail mailbox watch stopped for '${params.SubscriptionID}'`);
      return { Success: true };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        // Already gone - stopping a non-existent watch is idempotent success.
        return { Success: true };
      }
      const errorMessage = error instanceof Error ? error.message : 'Error stopping subscription';
      LogError('Error stopping subscription via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: `Error deleting subscription: ${errorMessage}`
      };
    }
  }

  /**
   * Parses an inbound Gmail Pub/Sub push notification. Pure: no network, never throws on
   * hostile/garbage input (returns `Success: false` + a 400 suggested status instead).
   *
   * The Pub/Sub push body is JSON of the shape
   * `{ message: { data: <base64 of JSON {emailAddress, historyId}>, messageId, publishTime }, subscription }`.
   * This is HINT-mode: the decoded payload only carries a `historyId`, so
   * {@link NormalizedNotification.MessageIDs} is empty and the consumer must re-fetch the
   * changed messages via the Gmail history API / GetMessages.
   *
   * NOTE: no cryptographic signature scheme is applied here, so
   * {@link ParseNotificationResult.SignatureValid} is left undefined. Pub/Sub push
   * authenticity is normally established via OIDC token verification on the push endpoint,
   * which is out of scope for this pure parser (the consumer's HTTP layer owns it).
   *
   * @param input - Transport-neutral capture of the inbound webhook request
   * @returns Promise<ParseNotificationResult> - One normalized notification, or a 400 failure
   */
  public override async ParseNotification(
    input: WebhookNotificationInput,
    _credentials?: GmailCredentials
  ): Promise<ParseNotificationResult> {
    const malformed = (reason: string): ParseNotificationResult => ({
      Success: false,
      ErrorMessage: reason,
      Notifications: [],
      SuggestedResponseStatus: 400
    });

    try {
      // 1. Parse the outer Pub/Sub envelope.
      let envelope: unknown;
      try {
        envelope = JSON.parse(input?.RawBody ?? '');
      } catch {
        return malformed('Malformed notification body (invalid JSON)');
      }

      // 2. Pull the base64-encoded message.data field.
      const message = (envelope as { message?: { data?: unknown } } | null)?.message;
      const data = message?.data;
      if (typeof data !== 'string' || data.length === 0) {
        return malformed('Notification body missing message.data');
      }

      // 3. base64-decode and JSON.parse the inner payload. Buffer.from is lenient on bad
      //    base64 (it won't throw), so the JSON.parse below is what catches garbage input.
      let payload: GmailPushData;
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        payload = JSON.parse(decoded) as GmailPushData;
      } catch {
        return malformed('Malformed message.data (invalid base64 or JSON)');
      }

      // 4. Require the fields Gmail always sends.
      if (typeof payload?.emailAddress !== 'string' || payload.emailAddress.length === 0) {
        return malformed('Decoded payload missing emailAddress');
      }
      if (payload.historyId == null) {
        return malformed('Decoded payload missing historyId');
      }

      const notification: NormalizedNotification = {
        Kind: 'message',
        Identifier: payload.emailAddress,
        ChangeType: 'created',
        // HINT-mode: empty — the consumer re-fetches changed messages via the history API.
        MessageIDs: [],
        RawData: payload
      };

      return {
        Success: true,
        // Pub/Sub acks the message on any 2xx; 204 is the conventional ack response.
        SuggestedResponseStatus: 204,
        Notifications: [notification]
      };
    } catch (error: unknown) {
      // Final safety net — this method must never throw on hostile input.
      const errorMessage = error instanceof Error ? error.message : 'Error parsing notification';
      return malformed(errorMessage);
    }
  }

  /**
   * Returns Gmail's subscription capabilities. Gmail mailbox watches expire after ~7 days
   * (so they must be re-watched), notify only on new/changed mail, deliver via Pub/Sub
   * (no endpoint validation handshake), are programmatically managed, and are HINT-mode
   * (the payload carries only a historyId, never the message inline).
   */
  public override GetSubscriptionCapabilities(): SubscriptionCapabilities {
    return {
      MaxLifetimeMinutes: GMAIL_MAX_SUBSCRIPTION_MINUTES, // Gmail watch expires ~7 days; must re-watch
      SupportedChangeTypes: ['created'],
      RequiresEndpointValidation: false,
      SupportsSubscriptionManagement: true,
      DeliversPayloadInline: false
    };
  }

  /**
   * Gets a single message by ID
   * @param params - Parameters for retrieving the message
   * @param credentials - Optional credentials override for this request
   */
  public override async GetSingleMessage(
    params: GetSingleMessageParams,
    credentials?: GmailCredentials
  ): Promise<GetSingleMessageResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      const response = await cached.client.users.messages.get({
        userId: 'me',
        id: params.MessageID,
        format: 'full'
      });

      if (!response.data) {
        return {
          Success: false,
          ErrorMessage: 'Message not found'
        };
      }

      const message = this.parseGmailMessage(response.data);

      return {
        Success: true,
        Message: message,
        SourceData: response.data
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error getting message';
      LogError(`Error getting message ${params.MessageID} from Gmail`, undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Deletes a message from Gmail
   * @param params - Parameters for deleting the message
   * @param credentials - Optional credentials override for this request
   */
  public override async DeleteMessage(
    params: DeleteMessageParams,
    credentials?: GmailCredentials
  ): Promise<DeleteMessageResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      if (params.PermanentDelete) {
        // Permanently delete the message
        await cached.client.users.messages.delete({
          userId: 'me',
          id: params.MessageID
        });
      } else {
        // Move to trash (adds TRASH label, removes INBOX)
        await cached.client.users.messages.trash({
          userId: 'me',
          id: params.MessageID
        });
      }

      LogStatus(`Message ${params.MessageID} deleted from Gmail (permanent: ${params.PermanentDelete})`);
      return {
        Success: true
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error deleting message';
      LogError(`Error deleting message ${params.MessageID} from Gmail`, undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Moves a message to a different label (Gmail's equivalent of folders)
   * In Gmail, moving is done by adding/removing labels
   * @param params - Parameters for moving the message
   * @param credentials - Optional credentials override for this request
   */
  public override async MoveMessage(
    params: MoveMessageParams,
    credentials?: GmailCredentials
  ): Promise<MoveMessageResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // First get current labels on the message
      const message = await cached.client.users.messages.get({
        userId: 'me',
        id: params.MessageID,
        format: 'minimal'
      });

      const currentLabels = message.data.labelIds || [];

      // Remove INBOX and other category labels, add the destination label
      const labelsToRemove = currentLabels.filter(label =>
        label === 'INBOX' ||
        label === 'CATEGORY_PERSONAL' ||
        label === 'CATEGORY_SOCIAL' ||
        label === 'CATEGORY_PROMOTIONS' ||
        label === 'CATEGORY_UPDATES' ||
        label === 'CATEGORY_FORUMS'
      );

      await cached.client.users.messages.modify({
        userId: 'me',
        id: params.MessageID,
        requestBody: {
          addLabelIds: [params.DestinationFolderID],
          removeLabelIds: labelsToRemove
        }
      });

      LogStatus(`Message ${params.MessageID} moved to label ${params.DestinationFolderID}`);
      return {
        Success: true,
        NewMessageID: params.MessageID // Gmail doesn't change message ID on move
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error moving message';
      LogError(`Error moving message ${params.MessageID} in Gmail`, undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Lists Gmail labels (Gmail's equivalent of folders)
   * @param params - Parameters for listing labels
   * @param credentials - Optional credentials override for this request
   */
  public override async ListFolders(
    params: ListFoldersParams,
    credentials?: GmailCredentials
  ): Promise<ListFoldersResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      const response = await cached.client.users.labels.list({
        userId: 'me'
      });

      if (!response.data.labels) {
        return {
          Success: true,
          Folders: []
        };
      }

      // Get detailed info for each label if counts requested
      let labels = response.data.labels;

      if (params.IncludeCounts) {
        const detailedLabels = await Promise.all(
          labels.map(async (label) => {
            if (!label.id) return label;
            try {
              const detail = await cached.client.users.labels.get({
                userId: 'me',
                id: label.id
              });
              return detail.data;
            } catch {
              return label;
            }
          })
        );
        labels = detailedLabels;
      }

      const folders: MessageFolder[] = labels.map(label => ({
        ID: label.id || '',
        Name: label.name || '',
        MessageCount: label.messagesTotal || undefined,
        UnreadCount: label.messagesUnread || undefined,
        IsSystemFolder: label.type === 'system',
        SystemFolderType: this.mapGmailLabelToSystemFolder(label.id || '')
      }));

      // Filter by parent if specified (Gmail doesn't have nested labels in the API the same way)
      // User labels can have "/" in names to simulate hierarchy
      if (params.ParentFolderID) {
        const parent = folders.find(f => UUIDsEqual(f.ID, params.ParentFolderID));
        if (parent) {
          const parentPrefix = parent.Name + '/';
          return {
            Success: true,
            Folders: folders.filter(f => f.Name.startsWith(parentPrefix)),
            Result: labels
          };
        }
      }

      return {
        Success: true,
        Folders: folders,
        Result: labels
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error listing labels';
      LogError('Error listing labels from Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Marks messages as read or unread
   * @param params - Parameters for marking messages
   * @param credentials - Optional credentials override for this request
   */
  public override async MarkAsRead(
    params: MarkAsReadParams,
    credentials?: GmailCredentials
  ): Promise<MarkAsReadResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // Process all messages
      await Promise.all(
        params.MessageIDs.map(async (messageId) => {
          await cached.client.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: params.IsRead
              ? { removeLabelIds: ['UNREAD'] }
              : { addLabelIds: ['UNREAD'] }
          });
        })
      );

      LogStatus(`Marked ${params.MessageIDs.length} message(s) as ${params.IsRead ? 'read' : 'unread'}`);
      return {
        Success: true
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error marking messages';
      LogError('Error marking messages as read/unread in Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Archives a message (removes INBOX label in Gmail)
   * @param params - Parameters for archiving the message
   * @param credentials - Optional credentials override for this request
   */
  public override async ArchiveMessage(
    params: ArchiveMessageParams,
    credentials?: GmailCredentials
  ): Promise<ArchiveMessageResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // In Gmail, archiving is simply removing the INBOX label
      await cached.client.users.messages.modify({
        userId: 'me',
        id: params.MessageID,
        requestBody: {
          removeLabelIds: ['INBOX']
        }
      });

      LogStatus(`Message ${params.MessageID} archived in Gmail`);
      return {
        Success: true
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error archiving message';
      LogError(`Error archiving message ${params.MessageID} in Gmail`, undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Searches messages using Gmail's search syntax
   * @param params - Parameters for searching messages
   * @param credentials - Optional credentials override for this request
   */
  public override async SearchMessages(
    params: SearchMessagesParams,
    credentials?: GmailCredentials
  ): Promise<SearchMessagesResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // Build Gmail search query
      let query = params.Query;

      // Add date filters if specified
      if (params.FromDate) {
        const fromDateStr = this.formatDateForGmail(params.FromDate);
        query += ` after:${fromDateStr}`;
      }
      if (params.ToDate) {
        const toDateStr = this.formatDateForGmail(params.ToDate);
        query += ` before:${toDateStr}`;
      }

      // Add folder/label filter
      if (params.FolderID) {
        query += ` label:${params.FolderID}`;
      }

      // Search messages
      const response = await cached.client.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: params.MaxResults || 50
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        return {
          Success: true,
          Messages: [],
          TotalCount: 0
        };
      }

      // Get full message details
      const fullMessages = await Promise.all(
        response.data.messages.map(async (msg) => {
          const full = await cached.client.users.messages.get({
            userId: 'me',
            id: msg.id || '',
            format: 'full'
          });
          return full.data;
        })
      );

      const messages = fullMessages.map(msg => this.parseGmailMessage(msg));

      return {
        Success: true,
        Messages: messages,
        TotalCount: response.data.resultSizeEstimate || messages.length,
        SourceData: fullMessages
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error searching messages';
      LogError('Error searching messages in Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Lists attachments on a message
   * @param params - Parameters for listing attachments
   * @param credentials - Optional credentials override for this request
   */
  public override async ListAttachments(
    params: ListAttachmentsParams,
    credentials?: GmailCredentials
  ): Promise<ListAttachmentsResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      const response = await cached.client.users.messages.get({
        userId: 'me',
        id: params.MessageID,
        format: 'full'
      });

      if (!response.data.payload) {
        return {
          Success: true,
          Attachments: []
        };
      }

      const attachments: MessageAttachment[] = [];
      this.extractAttachments(response.data.payload, attachments);

      return {
        Success: true,
        Attachments: attachments,
        Result: response.data
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error listing attachments';
      LogError(`Error listing attachments for message ${params.MessageID}`, undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  /**
   * Downloads an attachment from a message
   * @param params - Parameters for downloading the attachment
   * @param credentials - Optional credentials override for this request
   */
  public override async DownloadAttachment(
    params: DownloadAttachmentParams,
    credentials?: GmailCredentials
  ): Promise<DownloadAttachmentResult> {
    try {
      const creds = this.resolveCredentials(credentials);
      const cached = this.getGmailClient(creds);

      // First get attachment metadata to find filename and content type
      const message = await cached.client.users.messages.get({
        userId: 'me',
        id: params.MessageID,
        format: 'full'
      });

      let attachmentInfo: { filename: string; contentType: string } | null = null;
      if (message.data.payload) {
        attachmentInfo = this.findAttachmentInfo(message.data.payload, params.AttachmentID);
      }

      // Download the attachment
      const response = await cached.client.users.messages.attachments.get({
        userId: 'me',
        messageId: params.MessageID,
        id: params.AttachmentID
      });

      if (!response.data.data) {
        return {
          Success: false,
          ErrorMessage: 'Attachment content not found'
        };
      }

      // Gmail returns base64url encoded data, convert to standard base64
      const base64Data = response.data.data.replace(/-/g, '+').replace(/_/g, '/');
      const content = Buffer.from(base64Data, 'base64');

      return {
        Success: true,
        Content: content,
        ContentBase64: base64Data,
        Filename: attachmentInfo?.filename || 'attachment',
        ContentType: attachmentInfo?.contentType || 'application/octet-stream',
        Result: response.data
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error downloading attachment';
      LogError(`Error downloading attachment ${params.AttachmentID}`, undefined, error);
      return {
        Success: false,
        ErrorMessage: errorMessage
      };
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Issues a Gmail `users.watch` for a mailbox and shapes the result. Shared by
   * {@link CreateSubscription} and {@link RenewSubscription} (renewal is just re-watching).
   *
   * Gmail has no service-side subscription ID — the mailbox userId identifies the watch —
   * so {@link SubscriptionResult.SubscriptionID} is the userId. Gmail returns the expiration
   * as a milliseconds-since-epoch string.
   */
  private async issueWatch(
    client: googleApis.gmail_v1.Gmail,
    userId: string,
    context: GmailSubscriptionContext
  ): Promise<SubscriptionResult> {
    const requestBody: googleApis.gmail_v1.Schema$WatchRequest = {
      topicName: context.topicName,
      labelIds: context.labelIds && context.labelIds.length > 0 ? context.labelIds : ['INBOX']
    };
    if (context.labelFilterBehavior) {
      requestBody.labelFilterBehavior = context.labelFilterBehavior;
    }

    const resp = await client.users.watch({ userId, requestBody });
    const watch = resp.data;

    LogStatus(`Gmail mailbox watch registered for '${userId}' -> ${context.topicName}`);
    return {
      Success: true,
      // Gmail has no service-side subscription ID; the mailbox userId identifies the watch.
      SubscriptionID: userId,
      ExpiresAt: watch.expiration != null ? new Date(Number(watch.expiration)) : undefined,
      Result: watch
    };
  }

  /**
   * Best-effort detection of a "not found" (HTTP 404) error from the googleapis client, so
   * {@link DeleteSubscription} can treat an already-stopped watch as idempotent success.
   * Gaxios errors expose the status on `.code` and/or `.response.status`.
   */
  private isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const err = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
    return err.code === 404 || err.code === '404' || err.status === 404 || err.response?.status === 404;
  }

  /**
   * Decodes a Gmail part body. Gmail returns part data as base64url
   * (`-`/`_`, no padding), so we decode with the `base64url` encoding.
   */
  private decodePartData(data?: string | null): string {
    return data ? Buffer.from(data, 'base64url').toString('utf-8') : '';
  }

  /**
   * Recursively extracts the message body from a Gmail payload, walking the
   * full MIME tree (`payload.parts[].parts[]…`). Prefers `text/html`, falls
   * back to `text/plain`. Returns `''` only when no text part exists anywhere.
   *
   * Gmail nests the real body inside `multipart/*` containers for any message
   * that isn't trivially single-part — every email with embedded/inline
   * images, most HTML email, and forwarded/related content. Inspecting only
   * the top level (or a single direct `text/plain` child) misses those and
   * yields an empty body, so we must walk the whole tree.
   *
   * @param payload - The Gmail message payload (root `MessagePart`)
   * @returns The decoded body — HTML if present, otherwise plain text
   */
  private extractBody(payload?: googleApis.gmail_v1.Schema$MessagePart | null): string {
    if (!payload) {
      return '';
    }

    // Depth-first collect of the first html and first plain-text parts found
    // anywhere in the tree.
    let html = '';
    let text = '';

    const walk = (part: googleApis.gmail_v1.Schema$MessagePart): void => {
      const mime = (part.mimeType || '').toLowerCase();

      if (mime === 'text/html' && !html && part.body?.data) {
        html = this.decodePartData(part.body.data);
      } else if (mime === 'text/plain' && !text && part.body?.data) {
        text = this.decodePartData(part.body.data);
      } else if (!part.parts && (mime === '' || mime.startsWith('text/')) && part.body?.data && !html && !text) {
        // A single-part message carries its body directly on the payload,
        // with no child parts and sometimes no/blank mimeType.
        text = this.decodePartData(part.body.data);
      }

      for (const child of part.parts ?? []) {
        walk(child);
      }
    };

    walk(payload);

    // Prefer the HTML body; fall back to plain text.
    return html || text;
  }

  /**
   * Parses a Gmail message into the standard GetMessageMessage format
   */
  private parseGmailMessage(message: googleApis.gmail_v1.Schema$Message): GetMessageMessage {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    const from = getHeader('from');
    const to = getHeader('to');
    const subject = getHeader('subject');
    const replyTo = getHeader('reply-to') ? [getHeader('reply-to')] : [from];
    const dateStr = getHeader('date');

    // Extract body by recursively walking the full MIME tree (handles
    // embedded images, multipart/alternative, and HTML-only messages).
    const body = this.extractBody(message.payload);

    // Parse date
    let receivedAt: Date | undefined;
    if (dateStr) {
      try {
        receivedAt = new Date(dateStr);
      } catch {
        // Ignore parse errors
      }
    }

    // Internal date from Gmail (epoch milliseconds)
    let createdAt: Date | undefined;
    if (message.internalDate) {
      createdAt = new Date(parseInt(message.internalDate, 10));
    }

    return {
      From: from || '',
      To: to || '',
      ToRecipients: ParseEmailAddressList(to),
      CCRecipients: ParseEmailAddressList(getHeader('cc')),
      ReplyTo: replyTo.map(r => r || '').filter(r => r !== ''),
      Subject: subject || '',
      Body: body,
      ExternalSystemRecordID: message.id || '',
      ThreadID: message.threadId || '',
      ReceivedAt: receivedAt,
      CreatedAt: createdAt
    };
  }

  /**
   * Maps Gmail label IDs to system folder types
   */
  private mapGmailLabelToSystemFolder(labelId: string): MessageFolder['SystemFolderType'] {
    const labelMap: Record<string, MessageFolder['SystemFolderType']> = {
      'INBOX': 'inbox',
      'SENT': 'sent',
      'DRAFT': 'drafts',
      'TRASH': 'trash',
      'SPAM': 'spam',
      'STARRED': 'other',
      'IMPORTANT': 'other',
      'UNREAD': 'other',
      'CATEGORY_PERSONAL': 'other',
      'CATEGORY_SOCIAL': 'other',
      'CATEGORY_PROMOTIONS': 'other',
      'CATEGORY_UPDATES': 'other',
      'CATEGORY_FORUMS': 'other'
    };
    return labelMap[labelId] || undefined;
  }

  /**
   * Formats a date for Gmail search query (YYYY/MM/DD)
   */
  private formatDateForGmail(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * Recursively extracts attachment information from message parts
   */
  private extractAttachments(
    part: googleApis.gmail_v1.Schema$MessagePart,
    attachments: MessageAttachment[]
  ): void {
    // Check if this part is an attachment
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        ID: part.body.attachmentId,
        Filename: part.filename,
        ContentType: part.mimeType || 'application/octet-stream',
        Size: part.body.size || 0,
        IsInline: part.headers?.some(h =>
          h.name?.toLowerCase() === 'content-disposition' &&
          h.value?.toLowerCase().includes('inline')
        ) || false,
        ContentID: part.headers?.find(h =>
          h.name?.toLowerCase() === 'content-id'
        )?.value?.replace(/[<>]/g, '') || undefined
      });
    }

    // Recursively process nested parts
    if (part.parts) {
      for (const nestedPart of part.parts) {
        this.extractAttachments(nestedPart, attachments);
      }
    }
  }

  /**
   * Finds attachment info (filename, content type) by attachment ID
   */
  private findAttachmentInfo(
    part: googleApis.gmail_v1.Schema$MessagePart,
    attachmentId: string
  ): { filename: string; contentType: string } | null {
    if (part.body?.attachmentId === attachmentId) {
      return {
        filename: part.filename || 'attachment',
        contentType: part.mimeType || 'application/octet-stream'
      };
    }

    if (part.parts) {
      for (const nestedPart of part.parts) {
        const result = this.findAttachmentInfo(nestedPart, attachmentId);
        if (result) return result;
      }
    }

    return null;
  }
}