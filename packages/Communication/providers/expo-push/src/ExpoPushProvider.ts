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
  ProviderCredentialsBase,
  ReplyToMessageParams,
  ReplyToMessageResult,
  resolveCredentialValue,
  ProviderOperation
} from "@memberjunction/communication-types";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import * as Config from "./config";

/**
 * Credentials for the Expo Push provider.
 * Extends {@link ProviderCredentialsBase} to support per-request credential override.
 *
 * @remarks
 * All fields are optional. The Expo Push API can be called anonymously; supplying
 * an `accessToken` simply raises rate limits and enables enhanced push security.
 * The provider therefore degrades gracefully when no token is available.
 */
export interface ExpoPushCredentials extends ProviderCredentialsBase {
  /** Optional Expo access token used as a Bearer token for higher rate limits. */
  accessToken?: string;
}

/**
 * Resolved Expo credentials after merging request credentials with environment fallback.
 */
interface ResolvedExpoPushCredentials {
  /** Empty string when no token is configured; the provider still sends without it. */
  accessToken: string;
}

/**
 * The JSON payload sent to the Expo Push API for a single notification.
 * Mirrors the shape documented at https://docs.expo.dev/push-notifications/sending-notifications/.
 */
interface ExpoPushPayload {
  /** The recipient Expo push token (e.g. `ExponentPushToken[xxxxxxxx]`). */
  to: string;
  /** The notification title (mapped from the framework message subject). */
  title?: string;
  /** The notification body text (mapped from the framework message body). */
  body: string;
  /** Arbitrary JSON data delivered alongside the notification. */
  data?: Record<string, unknown>;
}

/**
 * A single push ticket returned by the Expo Push API in its `data` field.
 */
interface ExpoPushTicket {
  /** `ok` when Expo accepted the notification, `error` when it was rejected. */
  status: 'ok' | 'error';
  /** The receipt ID (present when `status` is `ok`) used to query delivery later. */
  id?: string;
  /** Human-readable error description (present when `status` is `error`). */
  message?: string;
  /** Provider-specific error details, e.g. `{ error: 'DeviceNotRegistered' }`. */
  details?: Record<string, unknown>;
}

/**
 * A top-level request error returned by the Expo Push API (e.g. malformed request).
 */
interface ExpoPushRequestError {
  code?: string;
  message?: string;
}

/**
 * The full response envelope returned by the Expo Push API.
 * `data` is a single ticket when a single message object is posted, or an array
 * when a batch is posted; this provider posts a single object.
 */
interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: ExpoPushRequestError[];
}

/**
 * Implementation of the Expo push-notification provider for MemberJunction's
 * Communication framework. Sends mobile push notifications to Expo push tokens
 * via the Expo Push API using a simple HTTPS POST (no SDK dependency).
 *
 * @remarks
 * Push notifications are a fire-and-forget, send-only channel. Consequently this
 * provider implements only {@link SendSingleMessage}; the mailbox-style operations
 * (`GetMessages`, `ForwardMessage`, `ReplyToMessage`, `CreateDraft`) return a
 * "not supported" result, consistent with the base-class contract.
 */
@RegisterClass(BaseCommunicationProvider, 'Expo Push')
export class ExpoPushProvider extends BaseCommunicationProvider {
  /**
   * Push is a real-time, send-only channel — only `SendSingleMessage` is supported.
   */
  public override getSupportedOperations(): ProviderOperation[] {
    return ['SendSingleMessage'];
  }

  /**
   * Resolves credentials by merging request credentials with environment fallback.
   * The access token is optional, so no required-field validation is performed.
   */
  private resolveCredentials(credentials?: ExpoPushCredentials): ResolvedExpoPushCredentials {
    const disableFallback = credentials?.disableEnvironmentFallback ?? false;
    const accessToken = resolveCredentialValue(credentials?.accessToken, Config.EXPO_ACCESS_TOKEN, disableFallback);
    return { accessToken: accessToken || '' };
  }

  /**
   * Extracts the optional JSON `data` payload from a message's context data.
   * Callers may set `ContextData.pushData` (preferred) or `ContextData.data`.
   */
  private extractData(message: ProcessedMessage): Record<string, unknown> | undefined {
    const context = message.ContextData as Record<string, unknown> | undefined;
    if (!context) {
      return undefined;
    }
    const data = (context.pushData ?? context.data) as Record<string, unknown> | undefined;
    return data && typeof data === 'object' ? data : undefined;
  }

  /**
   * Builds the Expo Push API request headers, attaching the Bearer token when present.
   */
  private buildHeaders(creds: ResolvedExpoPushCredentials): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    };
    if (creds.accessToken) {
      headers['Authorization'] = `Bearer ${creds.accessToken}`;
    }
    return headers;
  }

  /**
   * Normalizes the Expo response `data` (single ticket or array) to a single ticket.
   */
  private extractTicket(response: ExpoPushResponse): ExpoPushTicket | undefined {
    const data = response.data;
    if (Array.isArray(data)) {
      return data[0];
    }
    return data;
  }

  /**
   * Sends a single push notification via the Expo Push API.
   *
   * Maps the framework message model onto the Expo payload:
   * - `message.To` → the recipient Expo push token
   * - `message.ProcessedSubject` (fallback `message.Subject`) → `title`
   * - `message.ProcessedBody` (fallback `message.Body`) → `body`
   * - `message.ContextData.pushData` / `.data` → `data`
   *
   * @param message - The processed message to send.
   * @param credentials - Optional per-request credential override. When omitted,
   *                       the Expo access token (if any) is read from the environment.
   * @returns The framework's standard {@link MessageResult}.
   */
  public async SendSingleMessage(
    message: ProcessedMessage,
    credentials?: ExpoPushCredentials
  ): Promise<MessageResult> {
    try {
      if (!message.To) {
        return {
          Message: message,
          Success: false,
          Error: 'Recipient push token not specified'
        };
      }

      const creds = this.resolveCredentials(credentials);

      const payload: ExpoPushPayload = {
        to: message.To,
        title: message.ProcessedSubject || message.Subject || undefined,
        body: message.ProcessedBody || message.Body || '',
        data: this.extractData(message)
      };

      const response = await fetch(Config.EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: this.buildHeaders(creds),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          Message: message,
          Success: false,
          Error: `Expo Push API returned HTTP ${response.status} ${response.statusText}: ${text}`
        };
      }

      const json = (await response.json()) as ExpoPushResponse;

      // Top-level request errors (e.g. malformed payload) take precedence over tickets
      if (json.errors && json.errors.length > 0) {
        const errorText = json.errors.map((e) => e.message || e.code || 'Unknown error').join('; ');
        LogError(`Expo Push API request error: ${errorText}`);
        return {
          Message: message,
          Success: false,
          Error: `Expo Push API request error: ${errorText}`
        };
      }

      const ticket = this.extractTicket(json);
      if (!ticket) {
        return {
          Message: message,
          Success: false,
          Error: 'Expo Push API returned no push ticket'
        };
      }

      if (ticket.status === 'error') {
        const detail = ticket.details?.error ? ` (${String(ticket.details.error)})` : '';
        const errorMessage = `${ticket.message || 'Expo push ticket returned an error'}${detail}`;
        LogError(`Expo push error ticket: ${errorMessage}`);
        return {
          Message: message,
          Success: false,
          Error: errorMessage
        };
      }

      LogStatus(`Push notification sent via Expo (receipt ID: ${ticket.id ?? 'n/a'})`);
      return {
        Message: message,
        Success: true,
        Error: ''
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error sending push notification';
      LogError('Error sending push notification via Expo', undefined, error);
      return {
        Message: message,
        Success: false,
        Error: errorMessage
      };
    }
  }

  /**
   * Expo push is send-only; retrieving messages is not supported.
   */
  public async GetMessages(
    params: GetMessagesParams,
    credentials?: ExpoPushCredentials
  ): Promise<GetMessagesResult> {
    return {
      Success: false,
      Messages: [],
      ErrorMessage: `Expo Push does not support GetMessages (Identifier: ${params.Identifier ?? 'n/a'}, credentials provided: ${!!credentials})`
    };
  }

  /**
   * Expo push is send-only; forwarding is not supported.
   */
  public async ForwardMessage(
    params: ForwardMessageParams,
    credentials?: ExpoPushCredentials
  ): Promise<ForwardMessageResult> {
    return {
      Success: false,
      ErrorMessage: `Expo Push does not support ForwardMessage (MessageID: ${params.MessageID}, credentials provided: ${!!credentials})`
    };
  }

  /**
   * Expo push is send-only; replying is not supported.
   */
  public async ReplyToMessage(
    params: ReplyToMessageParams,
    credentials?: ExpoPushCredentials
  ): Promise<ReplyToMessageResult> {
    return {
      Success: false,
      ErrorMessage: `Expo Push does not support ReplyToMessage (MessageID: ${params.MessageID}, credentials provided: ${!!credentials})`
    };
  }

  /**
   * Expo push has no draft concept; creating drafts is not supported.
   */
  public async CreateDraft(
    params: CreateDraftParams,
    credentials?: ExpoPushCredentials
  ): Promise<CreateDraftResult> {
    return {
      Success: false,
      ErrorMessage: `Expo Push does not support creating draft messages (credentials provided: ${!!credentials}).`
    };
  }
}
