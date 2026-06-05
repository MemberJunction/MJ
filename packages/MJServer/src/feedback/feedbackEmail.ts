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
   * Context user under whose security context the email is sent. Used to
   * seed CommunicationEngine.Config. Callers SHOULD pass an explicit user:
   * the resolver passes the authenticated requestor, the webhook handler
   * passes the system user it resolves from scheduledJobs.systemUserEmail.
   * Optional only to allow bootstrap/CLI scenarios where no user exists.
   */
  contextUser?: UserInfo;
}

/**
 * Send a single feedback notification email through the configured
 * CommunicationEngine provider. Returns true on success, false otherwise
 * (with the underlying reason logged via LogError).
 *
 * Provider + message-type names come from feedbackSettings.emails
 * (defaulting to "SendGrid" / "Standard Email"). If the configured provider
 * isn't registered with CommunicationEngine, the call returns false after
 * logging the available providers — never throws. This lets callers run
 * fire-and-forget without try/catch wrappers.
 */
export async function sendFeedbackEmail(opts: SendFeedbackEmailOptions): Promise<boolean> {
  const emailSettings = configInfo.feedbackSettings?.emails;
  if (emailSettings?.enabled !== true) {
    // Opt-in: only send when the deployment has explicitly enabled the
    // email subsystem. Default-off keeps apps that adopt feedback without
    // wanting emails from getting noisy provider-misconfiguration errors.
    return false;
  }

  // Wrap everything below in a single try/catch so this function honors its
  // documented "never throws" contract. CommunicationEngine.Config and
  // SendSingleMessage both throw on provider/metadata/log failures, and the
  // webhook handler dispatches this fire-and-forget (`void sendFeedbackEmail`),
  // so an uncaught throw here would surface as an unhandled promise rejection
  // in the Node process. Catch, log, and return false instead.
  try {
    const fromAddress = getFeedbackFromAddress();
    const providerName = emailSettings.providerName ?? 'SendGrid';
    const messageTypeName = emailSettings.messageTypeName ?? 'Email';

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
  } catch (err) {
    LogError(`Feedback email to ${opts.to} (subject '${opts.subject}') threw`, undefined, err);
    return false;
  }
}

/**
 * Resolve the configured From: address for feedback emails. Priority:
 * env var > config > built-in default.
 */
export function getFeedbackFromAddress(): string {
  return process.env.FEEDBACK_EMAIL_FROM
    ?? configInfo.feedbackSettings?.emails?.fromAddress
    ?? 'no-reply@memberjunction.com';
}

/**
 * Resolve the app-name branding used in email subjects and bodies. Falls
 * back to a per-submission override, then to "MemberJunction".
 */
export function getFeedbackAppName(fallback?: string | null): string {
  return configInfo.feedbackSettings?.emails?.appName
    ?? fallback
    ?? 'MemberJunction';
}

/**
 * Resolve the accent color used for the email header bar and title-card
 * accent. Each deploying app can theme its emails via
 * feedbackSettings.emails.accentColor (e.g., "#0076b6"). Defaults to
 * MJ brand blue.
 */
export function getFeedbackAccentColor(): string {
  return configInfo.feedbackSettings?.emails?.accentColor ?? '#264FAF';
}

/**
 * Wrap a body HTML fragment in the shared branded email shell — a
 * centered table layout (max 600px), colored header bar with the app
 * name, padded body section, and a subtle footer. Designed to render
 * consistently across Gmail, Outlook (including legacy desktop), Apple
 * Mail, and mobile clients:
 *
 *   - All layout via <table> (Outlook ignores most flexbox/grid)
 *   - All styling inline (no <style> blocks — clients strip them)
 *   - No images, no web fonts, no external assets (max compatibility)
 *   - Hardcoded colors throughout (CSS variables don't work in email,
 *     and ng-ui-components design tokens would be wasted here)
 *
 * Caller provides the inner content via opts.bodyHtml. The shell handles
 * the chrome.
 */
export function wrapInEmailShell(opts: {
  appName: string;
  accentColor: string;
  bodyHtml: string;
}): string {
  const safeAppName = escapeHtml(opts.appName);
  return `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f5f7fa;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
        <tr><td style="background-color: ${opts.accentColor}; padding: 20px 28px;">
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 600; color: #ffffff; line-height: 1.4;">${safeAppName}</div>
        </td></tr>
        <tr><td style="padding: 32px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2d3748;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding: 16px 28px; background-color: #f9fafb; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #718096; text-align: center; line-height: 1.5;">
            You're receiving this because you submitted feedback to ${safeAppName}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Build the standard "issue title" card used in every email body. Inline
 * styles only; takes the accent color so the left border matches the
 * configured brand.
 */
export function buildIssueTitleCard(opts: {
  issueNumber: number;
  title: string;
  accentColor: string;
}): string {
  return `
<div style="margin: 24px 0; padding: 16px 20px; background-color: #f9fafb; border: 1px solid #e2e8f0; border-left: 4px solid ${opts.accentColor}; border-radius: 4px;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600;">Issue #${opts.issueNumber}</div>
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; color: #1a202c; font-weight: 500; line-height: 1.4;">${escapeHtml(opts.title)}</div>
</div>`.trim();
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
