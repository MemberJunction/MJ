import {
  BaseCommunicationProvider,
  CreateDraftParams,
  CreateDraftResult,
  ForwardMessageParams,
  ForwardMessageResult,
  GetMessagesParams,
  GetMessagesResult,
  MessageResult,
  ProcessedMessage,
  ReplyToMessageParams,
  ReplyToMessageResult,
} from '@memberjunction/communication-types';
import { Client } from '@microsoft/microsoft-graph-client';
import { User, Message } from '@microsoft/microsoft-graph-types';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/global';
import { compile, compiledFunction } from 'html-to-text';
import * as Auth from './auth';
import * as Config from './config';

/**
 * Implementation of the MS Graph provider for sending and receiving messages
 */
@RegisterClass(BaseCommunicationProvider, 'Microsoft Graph')
export class MSGraphProvider extends BaseCommunicationProvider {
  private ServiceAccount: User | null = null;
  private HTMLConverter: compiledFunction;

  constructor() {
    super();

    this.HTMLConverter = compile({
      wordwrap: 130,
    });
  }

  public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
    try {
      // Smart selection: use message.From if provided and different from default
      // This maintains backward compatibility while enabling custom From addresses
      let senderEmail: string | undefined;
      if (message.From && message.From.trim() !== '' && message.From !== Config.AZURE_ACCOUNT_EMAIL) {
        senderEmail = message.From;
      }

      const user: User | null = await this.GetServiceAccount(senderEmail);
      if (!user) {
        return {
          Message: message,
          Success: false,
          Error: 'Service account not found',
        };
      }

      if (!message) {
        return {
          Message: message,
          Success: false,
          Error: 'Message is null',
        };
      }

      const sendMail: Record<string, any> = {
        message: {
          subject: message.Subject,
          body: {
            contentType: message.ProcessedHTMLBody ? 'HTML' : 'Text',
            content: message.ProcessedHTMLBody || message.ProcessedBody,
          },
          toRecipients: [
            {
              emailAddress: {
                address: message.To,
              },
            },
          ],
          ccRecipients: message.CCRecipients?.map((recipient) => {
            return {
              emailAddress: {
                address: recipient,
              },
            };
          }),
          bccRecipients: message.BCCRecipients?.map((recipient) => {
            return {
              emailAddress: {
                address: recipient,
              },
            };
          }),
        },
        saveToSentItems: message.ContextData?.saveToSentItems ?? false,
      };

      if (message.Headers) {
        // Convert Headers (Record<string, string>) to internetMessageHeaders (Array[{key:value}])
        sendMail.message.internetMessageHeaders = Object.entries(message.Headers).map(([key, value]) => ({
          name: key.startsWith('X-') ? key : `X-${key}`,
          value: value,
        }));
      }

      const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/sendMail`;
      await Auth.GraphClient.api(sendMessagePath).post(sendMail);

      return {
        Message: message,
        Success: true,
        Error: '',
      };
    } catch (ex) {
      LogError(ex);
      return {
        Message: message,
        Success: false,
        Error: 'Error sending message',
      };
    }
  }

  public async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
    try {
      const user: User | null = await this.GetServiceAccount();
      if (!user) {
        return {
          Success: false,
          ErrorMessage: 'Service account not found',
        };
      }

      let reply: Record<string, any> = {
        message: {
          toRecipients: [
            {
              emailAddress: {
                address: params.Message.To,
              },
            },
          ],
          ccRecipients: params.Message.CCRecipients?.map((recipient) => {
            return {
              emailAddress: {
                address: recipient,
              },
            };
          }),
          bccRecipients: params.Message.BCCRecipients?.map((recipient) => {
            return {
              emailAddress: {
                address: recipient,
              },
            };
          }),
        },
        comment: params.Message.ProcessedBody || params.Message.ProcessedHTMLBody,
      };

      const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/messages/${params.MessageID}/reply`;
      const result: any = await Auth.GraphClient.api(sendMessagePath).post(reply);

      return {
        Success: true,
        Result: result,
      };
    } catch (ex) {
      LogError(ex);
      return {
        Success: false,
        ErrorMessage: 'Error sending message',
      };
    }
  }

  public async GetMessages(params: GetMessagesParams<Record<string, any>>): Promise<GetMessagesResult<Message>> {
    const contextData = params.ContextData;
    const user: User | null = await this.GetServiceAccount(contextData?.Email);
    if (!user || !user.id) {
      return {
        Success: false,
        Messages: [],
      };
    }

    let filter: string = '';
    let top: number = params.NumMessages;

    if (params.UnreadOnly) {
      filter = '(isRead eq false)';
    }

    if (contextData && contextData.Filter) {
      filter = contextData.Filter;
    }

    const messagesPath: string = `${Auth.ApiConfig.uri}/${user.id}/messages`;
    const Client: Client = Auth.GraphClient;
    const response: Record<string, any> | null = await Client.api(messagesPath).filter(filter).top(top).get();

    if (!response) {
      return {
        Success: false,
        Messages: [],
      };
    }

    const sourceMessages: Record<string, any>[] = response.value;

    let messageResults: GetMessagesResult = {
      Success: true,
      SourceData: sourceMessages,
      Messages: [],
    };

    let headers = null;
    // GetHeaders is an async function for one specific message.  I need
    // to resolve all of them into a structure, indexed by sourceMessage.id
    // and then apply that in the mapped message below.
    if (params.IncludeHeaders) {
      const headersPromises = sourceMessages.map((message) => this.GetHeaders(params, user, message.id));
      headers = await Promise.all(headersPromises);
    }

    const messages = sourceMessages.map((message: Message, index: number) => {
      const replyTo: string[] = message.replyTo?.map((replyTo) => replyTo.emailAddress?.address || '') || [];
      const primaryToRecipient: string = replyTo.length > 0 ? replyTo[0] : '';

      return {
        From: message.from?.emailAddress?.address || '',
        To: primaryToRecipient,
        ReplyTo: replyTo,
        Subject: message.subject || '',
        Body: contextData?.ReturnAsPlainTex ? this.HTMLConverter(message.body?.content || '') : message.body?.content || '',
        ExternalSystemRecordID: message.id || '',
        ThreadID: message.conversationId || '',
        Headers: headers ? headers[index] : null,
      };
    });

    messageResults.Messages = messages;

    if (contextData && contextData.MarkAsRead) {
      for (let message of messages) {
        this.MarkMessageAsRead(user.id, message.ExternalSystemRecordID);
      }
    }

    return messageResults;
  }

  public async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
    try {
      if (!params.MessageID) {
        return {
          Success: false,
          ErrorMessage: 'Message ID not set',
        };
      }

      const user: User | null = await this.GetServiceAccount();
      if (!user) {
        return {
          Success: false,
          ErrorMessage: 'Service account not found',
        };
      }

      const forward: Record<string, any> = {
        comment: params.Message,
        toRecipients: params.ToRecipients.map((recipient) => {
          return {
            emailAddress: {
              address: recipient,
            },
          };
        }),
        ccRecipients: params.CCRecipients?.map((recipient) => {
          return {
            emailAddress: {
              address: recipient,
            },
          };
        }),
        bccRecipients: params.BCCRecipients?.map((recipient) => {
          return {
            emailAddress: {
              address: recipient,
            },
          };
        }),
      };

      const sendMessagePath: string = `${Auth.ApiConfig.uri}/${user.id}/messages/${params.MessageID}/forward`;
      const forwardResult: any = await Auth.GraphClient.api(sendMessagePath).post(forward);

      return {
        Success: true,
        Result: forwardResult,
      };
    } catch (ex) {
      LogError(ex);
      return {
        ErrorMessage: 'An Error occurred while forwarding the message',
        Success: false,
      };
    }
  }

  protected async GetHeaders(params: GetMessagesParams, user: User, messageID: string | undefined): Promise<Record<string, string>> {
    if (params.IncludeHeaders && messageID) {
      const messageHeaderPath = `${Auth.ApiConfig.uri}/${user.id}/messages/${messageID}?$select=internetMessageHeaders`;
      const messageHeaderResponse = await Auth.GraphClient.api(messageHeaderPath).get();
      return (
        messageHeaderResponse.internetMessageHeaders?.map((header: { name: string; value: string }) => ({
          [header.name]: header.value,
        })) || {}
      );
    }
    return {};
  }

  protected async GetServiceAccount(email?: string): Promise<User | null> {
    if (this.ServiceAccount) {
      return this.ServiceAccount;
    }

    let accountEmail: string = email || Config.AZURE_ACCOUNT_EMAIL;

    const endpoint: string = `${Auth.ApiConfig.uri}/${accountEmail}`;
    const user: User | null = await Auth.GraphClient.api(endpoint).get();

    if (!user) {
      LogError('Error: could not get user info');
      return null;
    }

    const userID: string | undefined = user.id;
    if (!userID) {
      LogError('Error: userID not set for user');
      return null;
    }

    this.ServiceAccount = user;
    return user;
  }

  protected async MarkMessageAsRead(userID: string, messageID: string): Promise<boolean> {
    try {
      const Client: Client = Auth.GraphClient;
      const updatePath: string = `${Auth.ApiConfig.uri}/${userID}/messages/${messageID}`;
      const updatedMessage = {
        isRead: true,
      };

      await Client.api(updatePath).update(updatedMessage);
      LogStatus(`Message ${messageID} marked as read`);
      return true;
    } catch (ex) {
      LogError(ex);
      return false;
    }
  }

  public async CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult> {
    try {
      // Smart selection: use message.From if provided and different from default
      let senderEmail: string | undefined;
      if (params.Message.From && params.Message.From.trim() !== '' && params.Message.From !== Config.AZURE_ACCOUNT_EMAIL) {
        senderEmail = params.Message.From;
      }

      const user: User | null = await this.GetServiceAccount(senderEmail);
      if (!user) {
        return {
          Success: false,
          ErrorMessage: 'Service account not found',
        };
      }

      // Build message object (similar to SendSingleMessage but saved as draft)
      const draftMessage: Record<string, any> = {
        subject: params.Message.ProcessedSubject,
        body: {
          contentType: params.Message.ProcessedHTMLBody ? 'HTML' : 'Text',
          content: params.Message.ProcessedHTMLBody || params.Message.ProcessedBody,
        },
        toRecipients: [
          {
            emailAddress: { address: params.Message.To },
          },
        ],
        ccRecipients: params.Message.CCRecipients?.map((recipient) => ({
          emailAddress: { address: recipient },
        })),
        bccRecipients: params.Message.BCCRecipients?.map((recipient) => ({
          emailAddress: { address: recipient },
        })),
      };

      if (params.Message.Headers) {
        // Convert Headers (Record<string, string>) to internetMessageHeaders (Array[{key:value}])
        draftMessage.internetMessageHeaders = Object.entries(params.Message.Headers).map(([key, value]) => ({
          name: key.startsWith('X-') ? key : `X-${key}`,
          value: value,
        }));
      }

      // Create draft by POSTing to messages endpoint (not sendMail)
      const createDraftPath = `${Auth.ApiConfig.uri}/${user.id}/messages`;
      const result = await Auth.GraphClient.api(createDraftPath).post(draftMessage);

      LogStatus(`Draft created via MS Graph: ${result.id}`);
      return {
        Success: true,
        DraftID: result.id,
        Result: result,
      };
    } catch (ex) {
      LogError('Error creating draft via MS Graph', undefined, ex);
      return {
        Success: false,
        ErrorMessage: 'Error creating draft',
      };
    }
  }
}

export function LoadMSGraphProvider() {
  // do nothing, this prevents tree shaking from removing this class
}
