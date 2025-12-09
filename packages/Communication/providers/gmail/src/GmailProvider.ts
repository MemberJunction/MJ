import { BaseCommunicationProvider, CreateDraftParams, CreateDraftResult, ForwardMessageParams, ForwardMessageResult, GetMessageMessage, GetMessagesParams, GetMessagesResult, MessageResult, ProcessedMessage, ProviderCredentialsBase, ReplyToMessageParams, ReplyToMessageResult, resolveCredentialValue, validateRequiredCredentials } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import * as Config from "./config";
import * as googleApis from 'googleapis';

/**
 * Credentials for Gmail provider using OAuth2.
 * Extend ProviderCredentialsBase to support per-request credential override.
 *
 * @remarks
 * **TEMPORARY INTERFACE**: This interface is part of the interim credential solution for 2.x patch release.
 * In MemberJunction 3.0, this will be integrated with the comprehensive credential management system.
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
 * Implementation of the Gmail provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'Gmail')
export class GmailProvider extends BaseCommunicationProvider {
  /** Cached Gmail client for environment credentials */
  private envGmailClient: CachedGmailClient | null = null;

  /** Cache of Gmail clients for per-request credentials */
  private clientCache: Map<string, CachedGmailClient> = new Map();

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
    let cached = this.clientCache.get(cacheKey);

    if (!cached) {
      cached = {
        client: this.createGmailClient(creds),
        userEmail: null
      };
      this.clientCache.set(cacheKey, cached);
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
   * Encode and format email content for Gmail API
   */
  private createEmailContent(message: ProcessedMessage, creds: ResolvedGmailCredentials): string {
    // Get sender email
    const from = message.From || creds.serviceAccountEmail;
    const fromName = message.FromName || '';
    const fromHeader = fromName ? `${fromName} <${from}>` : from;

    // Create email content
    const subject = message.ProcessedSubject;
    const to = message.To;
    const cc = message.CCRecipients?.join(', ') || '';
    const bcc = message.BCCRecipients?.join(', ') || '';
    
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

      // Build query
      let query = '';
      if (params.UnreadOnly) {
        query = 'is:unread';
      }

      if (params.ContextData?.query) {
        query = params.ContextData.query as string;
      }

      // Get messages
      const response = await cached.client.users.messages.list({
        userId: 'me',
        maxResults: params.NumMessages,
        q: query
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        return {
          Success: true,
          Messages: []
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

        // Extract body
        let body = '';
        if (message.payload?.body?.data) {
          // Base64 encoded data
          body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
        } else if (message.payload?.parts) {
          // Multipart message, try to find text part
          const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
          if (textPart && textPart.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        return {
          From: from || '',
          To: to || '',
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
        SourceData: fullMessages
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

      // Build forwarded message
      const userEmail = await this.getUserEmail(cached);
      const to = params.ToRecipients.join(', ');
      const cc = params.CCRecipients?.join(', ') || '';
      const bcc = params.BCCRecipients?.join(', ') || '';

      // Parse the original email to extract subject
      const subjectMatch = rawContent.match(/Subject: (.*?)(\r?\n)/);
      const subject = subjectMatch ? `Fwd: ${subjectMatch[1]}` : 'Fwd: ';

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
}

export function LoadProvider() {
  // do nothing, this prevents tree shaking from removing this class
}