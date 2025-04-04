import { BaseCommunicationProvider, ForwardMessageParams, ForwardMessageResult, GetMessagesParams, GetMessagesResult, MessageResult, ProcessedMessage, ReplyToMessageParams, ReplyToMessageResult } from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import twilio from 'twilio';
import * as Config from "./config";

/**
 * Implementation of the Twilio provider for sending and receiving messages (SMS, WhatsApp, Facebook Messenger)
 */
@RegisterClass(BaseCommunicationProvider, 'Twilio')
export class TwilioProvider extends BaseCommunicationProvider {
  private twilioClient: any;
  
  constructor() {
    super();
    this.twilioClient = twilio(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN);
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
   * Format the sender number/ID based on channel type
   */
  private formatFrom(channelType: 'sms' | 'whatsapp' | 'messenger'): string {
    switch (channelType) {
      case 'whatsapp':
        return Config.TWILIO_WHATSAPP_NUMBER ? `whatsapp:${Config.TWILIO_WHATSAPP_NUMBER}` : '';
      case 'messenger':
        return Config.TWILIO_FACEBOOK_PAGE_ID ? `messenger:${Config.TWILIO_FACEBOOK_PAGE_ID}` : '';
      case 'sms':
      default:
        return Config.TWILIO_PHONE_NUMBER;
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
   */
  public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
    try {
      if (!message.To) {
        return {
          Message: message,
          Success: false,
          Error: 'Recipient not specified'
        };
      }

      // Determine channel type (SMS, WhatsApp, Messenger)
      const channelType = this.getChannelType(message.To);
      
      // Format sender and recipient
      const from = message.From || this.formatFrom(channelType);
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

      // Send the message
      const result = await this.twilioClient.messages.create({
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
    } catch (error: any) {
      LogError('Error sending message via Twilio', undefined, error);
      return {
        Message: message,
        Success: false,
        Error: error.message || 'Error sending message'
      };
    }
  }

  /**
   * Gets messages from Twilio
   */
  public async GetMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
    try {
      // Build query parameters
      const queryParams: any = {
        limit: params.NumMessages
      };

      // Filter options
      if (params.ContextData) {
        // Filter by date sent
        if (params.ContextData.dateSent) {
          queryParams.dateSent = params.ContextData.dateSent;
        }
        
        // Filter by sender
        if (params.ContextData.from) {
          queryParams.from = params.ContextData.from;
        }
        
        // Filter by recipient
        if (params.ContextData.to) {
          queryParams.to = params.ContextData.to;
        }
      }

      // Fetch messages
      const messages = await this.twilioClient.messages.list(queryParams);
      
      // Format messages into standard structure
      const formattedMessages = messages.map((message: any) => {
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
    } catch (error: any) {
      LogError('Error fetching messages from Twilio', undefined, error);
      return {
        Success: false,
        Messages: [],
        ErrorMessage: error.message || 'Error fetching messages'
      };
    }
  }

  /**
   * Reply to a message using Twilio
   */
  public async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
    try {
      if (!params.MessageID) {
        return {
          Success: false,
          ErrorMessage: 'Message ID not provided'
        };
      }

      // Get original message to determine recipient and channel
      const originalMessage = await this.twilioClient.messages(params.MessageID).fetch();
      
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
      const from = params.Message.From || this.formatFrom(channelType);

      // Prepare message content
      const body = params.Message.ProcessedBody || '';
      
      // Optional media URLs
      const mediaUrls = params.Message.ContextData?.mediaUrls as string[] || [];

      // Send the reply
      const result = await this.twilioClient.messages.create({
        body,
        from,
        to,
        ...(mediaUrls.length > 0 && { mediaUrl: mediaUrls })
      });

      return {
        Success: true,
        Result: result
      };
    } catch (error: any) {
      LogError('Error replying to message via Twilio', undefined, error);
      return {
        Success: false,
        ErrorMessage: error.message || 'Error replying to message'
      };
    }
  }

  /**
   * Forward a message using Twilio
   * Note: Twilio doesn't have a native "forward" concept, so we implement it as a new message
   * that includes the content of the original message
   */
  public async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
    try {
      if (!params.MessageID || !params.ToRecipients || params.ToRecipients.length === 0) {
        return {
          Success: false,
          ErrorMessage: 'Message ID or recipients not provided'
        };
      }

      // Get the original message
      const originalMessage = await this.twilioClient.messages(params.MessageID).fetch();
      
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
        const from = this.formatFrom(channelType);
        const to = this.formatTo(recipient, channelType);
        
        return this.twilioClient.messages.create({
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
    } catch (error: any) {
      LogError('Error forwarding message via Twilio', undefined, error);
      return {
        Success: false,
        ErrorMessage: error.message || 'Error forwarding message'
      };
    }
  }
}

export function LoadProvider() {
  // do nothing, this prevents tree shaking from removing this class
}