import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { SendToAudience } from '@memberjunction/communication-engine';
import type { AudienceSource } from '@memberjunction/lists';
import type { Message, ProviderCredentialsBase } from '@memberjunction/communication-types';

/**
 * Send a single message template to every record resolved from an
 * `AudienceSource` (List / View / ad-hoc filter). Wraps the
 * `SendToAudience` function from `@memberjunction/communication-engine`
 * so the New Communication UI and any agent/workflow can drive a
 * bulk send through the standard Action API.
 *
 * Required params:
 *   - Source: JSON-stringified `AudienceSource` ({kind:'list'|'view'|'adhoc', ...})
 *   - RecipientField: field name on the audience entity holding the recipient address (e.g. 'Email')
 *   - ProviderName: communication provider name (e.g. 'SendGrid')
 *   - ProviderMessageTypeName: provider message type (e.g. 'SingleEmail')
 *   - From: sender address
 *   - Subject, Body: standard message content. Body may include record tokens evaluated by the channel.
 *
 * Optional params:
 *   - FullNameField: field name for recipient's full name (for "FirstName LastName <addr>" formatting)
 *   - BodyTemplate: alternative to Body; the channel renders templating against per-record context
 *   - PreviewOnly: when true, resolve audience + build recipients but do NOT send. Returns counts only.
 *   - Credentials: JSON-stringified per-request credential override
 *
 * Outputs:
 *   - TotalAudienceSize, WillReceiveCount, SkippedCount, FailedCount
 *   - SkippedRecords: JSON array of {RecordID, Reason, Message}
 *   - PreviewOnly: true|false
 *
 * Drop-guard contract: this action never deletes any record — it only
 * sends messages. The audience picker in the UI uses `Resolve Audience`
 * first to preview counts before invoking this.
 */
@RegisterClass(BaseAction, 'Send To Audience')
export class SendToAudienceAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const getStr = (name: string): string | undefined => {
      const p = params.Params.find((x) => x.Name.toLowerCase() === name.toLowerCase() && x.Type === 'Input');
      return p?.Value != null ? String(p.Value) : undefined;
    };
    const getJson = <T>(name: string): T | undefined => {
      const raw = getStr(name);
      if (raw == null || raw.trim().length === 0) return undefined;
      try { return JSON.parse(raw) as T; } catch { return undefined; }
    };
    const getBool = (name: string, dflt: boolean): boolean => {
      const v = getStr(name);
      if (v == null) return dflt;
      const lc = v.toLowerCase();
      if (lc === 'true' || lc === '1' || lc === 'yes') return true;
      if (lc === 'false' || lc === '0' || lc === 'no') return false;
      return dflt;
    };
    const missing = (name: string): ActionResultSimple => ({
      Success: false,
      ResultCode: 'MISSING_PARAMETER',
      Message: `'${name}' is required`,
    });

    const source = getJson<AudienceSource>('Source');
    if (!source) {
      const raw = getStr('Source');
      if (raw == null || raw.length === 0) return missing('Source');
      return { Success: false, ResultCode: 'INVALID_PARAMETER', Message: "'Source' must be JSON-stringified AudienceSource" };
    }
    const recipientField = getStr('RecipientField');
    const providerName = getStr('ProviderName');
    const providerMessageTypeName = getStr('ProviderMessageTypeName');
    const from = getStr('From');
    const subject = getStr('Subject');
    const body = getStr('Body');
    if (!recipientField) return missing('RecipientField');
    if (!providerName) return missing('ProviderName');
    if (!providerMessageTypeName) return missing('ProviderMessageTypeName');
    if (!from) return missing('From');

    // Build a Partial<Message> and cast at the boundary — the engine
    // resolves the concrete MessageType from `ProviderName` +
    // `ProviderMessageTypeName` before sending. SendToAudience itself
    // only reads From / Subject / Body off Message; To gets populated
    // per recipient inside the engine. Using Partial here avoids the
    // `undefined as unknown as Message['MessageType']` cast and is the
    // honest type for what we're constructing (a stub the engine
    // completes).
    const messageStub: Partial<Message> = {
      From: from,
      To: '',
      Subject: subject,
      Body: body,
    };
    const credentials = getJson<ProviderCredentialsBase>('Credentials');

    try {
      const result = await SendToAudience({
        Source: source,
        RecipientField: recipientField,
        FullNameField: getStr('FullNameField'),
        ProviderName: providerName,
        ProviderMessageTypeName: providerMessageTypeName,
        Message: messageStub as Message,
        Credentials: credentials,
        PreviewOnly: getBool('PreviewOnly', false),
        ContextUser: params.ContextUser,
        Provider: params.Provider,
      });

      const failed = result.Results.filter((r) => !r.Success).length;
      params.Params.push({ Name: 'TotalAudienceSize', Type: 'Output', Value: result.TotalAudienceSize });
      params.Params.push({ Name: 'WillReceiveCount', Type: 'Output', Value: result.WillReceiveCount });
      params.Params.push({ Name: 'SkippedCount', Type: 'Output', Value: result.SkippedCount });
      params.Params.push({ Name: 'FailedCount', Type: 'Output', Value: failed });
      params.Params.push({ Name: 'SkippedRecords', Type: 'Output', Value: JSON.stringify(result.Skipped) });
      params.Params.push({ Name: 'PreviewOnly', Type: 'Output', Value: result.PreviewOnly });

      const sent = result.Results.length - failed;
      return {
        Success: failed === 0,
        ResultCode: failed === 0 ? (result.PreviewOnly ? 'PREVIEW' : 'SUCCESS') : 'PARTIAL_SUCCESS',
        Message: result.PreviewOnly
          ? `Preview: ${result.WillReceiveCount} of ${result.TotalAudienceSize} would receive (${result.SkippedCount} skipped)`
          : `Sent ${sent} message(s), ${failed} failed, ${result.SkippedCount} skipped`,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
    }
  }
}
