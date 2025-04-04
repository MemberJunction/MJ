import { BaseCommunicationProvider, ForwardMessageParams, ForwardMessageResult, GetMessageMessage, GetMessagesParams, GetMessagesResult, MessageResult, ProcessedMessage, ReplyToMessageParams, ReplyToMessageResult } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import * as Config from "./config";
import * as googleApis from 'googleapis';

/**
 * Implementation of the Gmail provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'Gmail')
export class GmailProvider extends BaseCommunicationProvider {
  private userEmail: string | null = null;
  private gmailClient: googleApis.gmail_v1.Gmail;
  
  constructor() {
    super();
    
    // Create OAuth2 client
    const oauth2Client = new googleApis.google.auth.OAuth2(
      Config.GMAIL_CLIENT_ID,
      Config.GMAIL_CLIENT_SECRET,
      Config.GMAIL_REDIRECT_URI
    );

    // Set refresh token to automatically refresh access tokens
    oauth2Client.setCredentials({
      refresh_token: Config.GMAIL_REFRESH_TOKEN
    });

    // Create Gmail API client
    this.gmailClient = googleApis.google.gmail({
      version: 'v1',
      auth: oauth2Client
    });
  }

  /**
   * Gets the authenticated user's email address
   */
  private async getUserEmail(): Promise<string | null> {
    if (this.userEmail) {
      return this.userEmail;
    }

    try {
      // Get user profile to verify authentication
      const response = await this.gmailClient.users.getProfile({
        userId: 'me'
      });
      
      if (response.data && response.data.emailAddress) {
        this.userEmail = response.data.emailAddress;
        return this.userEmail;
      }
      return null;
    } catch (error: any) {
      LogError('Failed to get Gmail user email', undefined, error);
      return null;
    }
  }

  /**
   * Encode and format email content for Gmail API
   */
  private createEmailContent(message: ProcessedMessage): string {
    // Get sender email
    const from = message.From || Config.GMAIL_SERVICE_ACCOUNT_EMAIL;
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
   */
  public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
    try {
      // Get user email
      const userEmail = await this.getUserEmail();
      if (!userEmail) {
        return {
          Message: message,
          Success: false,
          Error: 'Could not get user email'
        };
      }

      // Create raw email content in base64 URL-safe format
      const raw = this.createEmailContent(message);

      // Send the email
      const result = await this.gmailClient.users.messages.send({
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
    } catch (error: any) {
      LogError('Error sending message via Gmail', undefined, error);
      return {
        Message: message,
        Success: false,
        Error: error.message || 'Error sending message'
      };
    }
  }

  /**
   * Gets messages from Gmail
   */
  public async GetMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
    try {
      const userEmail = await this.getUserEmail();
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
        query = params.ContextData.query;
      }

      // Get messages
      const response = await this.gmailClient.users.messages.list({
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
        const fullMessage = await this.gmailClient.users.messages.get({
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
            await this.markMessageAsRead(message.id);
          }
        }
      }

      return {
        Success: true,
        Messages: processedMessages,
        SourceData: fullMessages
      };
    } catch (error: any) {
      LogError('Error getting messages from Gmail', undefined, error);
      return {
        Success: false,
        Messages: [],
        ErrorMessage: error.message || 'Error getting messages'
      };
    }
  }

  /**
   * Reply to a message using Gmail API
   */
  public async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
    try {
      if (!params.MessageID) {
        return {
          Success: false,
          ErrorMessage: 'Message ID not provided'
        };
      }

      // Get the original message to obtain threadId
      const originalMessage = await this.gmailClient.users.messages.get({
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
      const raw = this.createEmailContent(params.Message);

      // Send the reply in the same thread
      const result = await this.gmailClient.users.messages.send({
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
    } catch (error: any) {
      LogError('Error replying to message via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: error.message || 'Error replying to message'
      };
    }
  }

  /**
   * Forward a message using Gmail API
   */
  public async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
    try {
      if (!params.MessageID) {
        return {
          Success: false,
          ErrorMessage: 'Message ID not provided'
        };
      }

      // Get the original message
      const originalMessage = await this.gmailClient.users.messages.get({
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
      const userEmail = await this.getUserEmail();
      const to = params.ToRecipients.join(', ');
      const cc = params.CCRecipients?.join(', ') || '';
      const bcc = params.BCCRecipients?.join(', ') || '';
      
      // Parse the original email to extract subject
      const subjectMatch = rawContent.match(/Subject: (.*?)(\r?\n)/);
      const subject = subjectMatch ? `Fwd: ${subjectMatch[1]}` : 'Fwd: ';
      
      // Headers for new message
      let emailContent = [
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
      const result = await this.gmailClient.users.messages.send({
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
    } catch (error: any) {
      LogError('Error forwarding message via Gmail', undefined, error);
      return {
        Success: false,
        ErrorMessage: error.message || 'Error forwarding message'
      };
    }
  }

  /**
   * Helper to mark a message as read
   */
  private async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      await this.gmailClient.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
      return true;
    } catch (error: any) {
      LogError(`Error marking message ${messageId} as read`, undefined, error);
      return false;
    }
  }
}

export function LoadProvider() {
  // do nothing, this prevents tree shaking from removing this class
}