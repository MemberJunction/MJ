import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { configInfo } from '../config.js';

/**
 * Options for sending a feedback notification email (confirmation,
 * status-change, or new-comment). The caller assembles the subject
 * and body; this module handles provider lookup, send dispatch, and
 * uniform error logging.
 */
export interface SendFeedbackEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  /**
   * Optional context user. Only used to seed CommunicationEngine.Config on
   * the first call — webhook handlers correctly pass undefined here since
   * GitHub webhooks are unauthenticated from MJ's perspective.
   */
  contextUser?: UserInfo;
}

/**
 * Send a single feedback notification email through the configured
 * CommunicationEngine provider. Returns true on success, false otherwise
 * (with the underlying reason logged via LogError).
 *
 * Provider + message-type names come from feedbackSettings.notifications
 * (defaulting to "SendGrid" / "Standard Email"). If the configured provider
 * isn't registered with CommunicationEngine, the call returns false after
 * logging the available providers — never throws. This lets callers run
 * fire-and-forget without try/catch wrappers.
 */
export async function sendFeedbackEmail(opts: SendFeedbackEmailOptions): Promise<boolean> {
  const notifSettings = configInfo.feedbackSettings?.notifications;
  if (notifSettings?.enabled === false) {
    return false;
  }

  const fromAddress = getFeedbackFromAddress();
  const providerName = notifSettings?.providerName ?? 'SendGrid';
  const messageTypeName = notifSettings?.messageTypeName ?? 'Email';

  await CommunicationEngine.Instance.Config(false, opts.contextUser);

  const provider = CommunicationEngine.Instance.Providers.find(p => p.Name === providerName);
  if (!provider) {
    const available = CommunicationEngine.Instance.Providers.map(p => p.Name).join(', ') || '(none)';
    LogError(`Cannot send feedback email: provider '${providerName}' not configured. Available: ${available}`);
    return false;
  }
  const messageType = provider.MessageTypes.find(mt => mt.Name === messageTypeName);
  if (!messageType) {
    const available = provider.MessageTypes.map(mt => mt.Name).join(', ') || '(none)';
    LogError(`Cannot send feedback email: message type '${messageTypeName}' not found on provider '${providerName}'. Available: ${available}`);
    return false;
  }

  const message: Message = {
    MessageType: messageType,
    From: fromAddress,
    To: opts.to,
    Subject: opts.subject,
    Body: opts.textBody,
    HTMLBody: opts.htmlBody,
  };

  const result = await CommunicationEngine.Instance.SendSingleMessage(providerName, messageTypeName, message);
  if (!result?.Success) {
    LogError(`Feedback email failed to ${opts.to} (subject '${opts.subject}'): ${result?.Error ?? 'unknown error'}`);
    return false;
  }
  LogStatus(`Feedback email sent to ${opts.to} (subject '${opts.subject}')`);
  return true;
}

/**
 * Resolve the configured From: address for feedback emails. Priority:
 * env var > config > built-in default.
 */
export function getFeedbackFromAddress(): string {
  return process.env.FEEDBACK_NOTIFICATIONS_FROM
    ?? configInfo.feedbackSettings?.notifications?.fromAddress
    ?? 'no-reply@memberjunction.com';
}

/**
 * Resolve the app-name branding used in email subjects and bodies. Falls
 * back to a per-submission override, then to "MemberJunction".
 */
export function getFeedbackAppName(fallback?: string | null): string {
  return configInfo.feedbackSettings?.notifications?.appName
    ?? fallback
    ?? 'MemberJunction';
}

/**
 * Escape HTML special characters for safe inclusion in an email body.
 * All untrusted strings (user input, GitHub commenter names, comment bodies,
 * issue titles) must pass through this before being interpolated into HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
