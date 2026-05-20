import { Metadata, RunView, UserInfo, type IMetadataProvider, LogError } from '@memberjunction/core';
import { MessageRecipient, type Message, type MessageResult, type ProviderCredentialsBase } from '@memberjunction/communication-types';
import { AudienceResolver, type AudienceSource } from '@memberjunction/lists';

import { CommunicationEngine } from './Engine';

/**
 * Reasons a record was excluded from a `SendToAudience` send. The set is
 * intentionally small — anything more granular belongs in the underlying
 * provider's bounce/return-path handling.
 */
export type AudienceSkipReason = 'MISSING_RECIPIENT_FIELD' | 'INVALID_RECIPIENT_FIELD';

export interface AudienceSkipDetail {
  RecordID: string;
  Reason: AudienceSkipReason;
  Message: string;
}

/**
 * Result of a `SendToAudience` call. Mirrors the per-message
 * `MessageResult[]` from `SendMessages` and additionally surfaces the
 * audience-resolution metadata so the caller can render an "Audience
 * Summary" panel (per mockup 21) without re-running the resolve.
 */
export interface SendToAudienceResult {
  TotalAudienceSize: number;
  WillReceiveCount: number;
  SkippedCount: number;
  Skipped: AudienceSkipDetail[];
  Results: MessageResult[];
  /** When `previewOnly` is true, `Results` is empty and this flag indicates we never dispatched. */
  PreviewOnly: boolean;
}

/**
 * Args for `SendToAudience`. Kept separate from `Message` because the
 * audience layer adds its own dimensions (source, field mapping) that
 * don't belong on the underlying transport-level `Message` type.
 */
export interface SendToAudienceParams {
  /** Where the audience comes from — a List, View, or ad-hoc filter. */
  Source: AudienceSource;
  /**
   * Name of the field on the audience entity that holds the recipient
   * address (e.g. `'Email'` for Contacts, `'PhoneNumber'` for SMS). Records
   * that don't have a non-empty value for this field are skipped and
   * surfaced in `Skipped` so the UI can show them to the sender.
   */
  RecipientField: string;
  /** Optional name of a "full name" field, used to populate `MessageRecipient.FullName`. */
  FullNameField?: string;
  /** Provider name (e.g. `'SendGrid'`). Same value the underlying `SendMessages` takes. */
  ProviderName: string;
  /** Provider message type name (e.g. `'SingleEmail'`). */
  ProviderMessageTypeName: string;
  /** Base message — `From`, subject/body, etc. `To` is overwritten per recipient. */
  Message: Message;
  /** Optional per-request credentials override. Forwarded to `SendMessages`. */
  Credentials?: ProviderCredentialsBase;
  /** When true, resolve + build recipient list but don't actually send. */
  PreviewOnly?: boolean;
  /** Context user — required, used for authorization on the underlying provider. */
  ContextUser: UserInfo;
  /** Optional multi-provider scope. Forwarded to the resolver + RunView. */
  Provider?: IMetadataProvider;
}

/**
 * Resolve an `AudienceSource` into concrete `MessageRecipient`s, then
 * fan out via `CommunicationEngine.SendMessages`. The translation step
 * is deliberately kept here (not on the engine) because it's
 * audience-aware: it knows about entity primary keys, the recipient
 * field mapping, and the skip-on-missing-field policy.
 *
 * Records whose `RecipientField` is missing or empty are skipped and
 * returned in `Skipped` rather than failing the whole send — matches
 * the plan's "skip records missing the mapped field with a warning"
 * contract.
 */
export async function SendToAudience(args: SendToAudienceParams): Promise<SendToAudienceResult> {
  // 1. Resolve the audience.
  const resolver = new AudienceResolver(args.ContextUser, args.Provider);
  const resolved = await resolver.Resolve(args.Source);
  const total = resolved.RecordIds.length;

  if (total === 0) {
    return emptyResult(args.PreviewOnly === true);
  }

  // 2. Bulk-load the underlying records so we can extract the recipient field.
  const md = (args.Provider as unknown as Metadata | undefined) ?? new Metadata();
  const entityInfo = md.EntityByName(resolved.EntityName);
  if (!entityInfo) {
    throw new Error(`Entity '${resolved.EntityName}' not found in metadata`);
  }
  const pkFields = entityInfo.PrimaryKeys.map((pk) => pk.Name);
  const fields = unique([...pkFields, args.RecipientField, ...(args.FullNameField ? [args.FullNameField] : [])]);

  const rv = args.Provider ? RunView.FromMetadataProvider(args.Provider) : new RunView();
  // For single-PK entities the resolved IDs are raw values. Composite
  // PKs serialize to `Field1|Value1||Field2|Value2`; we don't support
  // composite-PK recipient lookups here yet — surface clearly and skip.
  if (pkFields.length !== 1) {
    LogError(
      `SendToAudience: composite-PK entities ('${resolved.EntityName}', PK=${pkFields.join('+')}) are not yet supported. ` +
        'All records will be reported as skipped.',
    );
    return {
      TotalAudienceSize: total,
      WillReceiveCount: 0,
      SkippedCount: total,
      Skipped: resolved.RecordIds.map((id) => ({
        RecordID: id,
        Reason: 'INVALID_RECIPIENT_FIELD',
        Message: 'Composite-PK entities are not yet supported for SendToAudience',
      })),
      Results: [],
      PreviewOnly: args.PreviewOnly === true,
    };
  }
  const pk = pkFields[0];
  const idList = resolved.RecordIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');

  const loadResult = await rv.RunView<Record<string, unknown>>({
    EntityName: resolved.EntityName,
    ExtraFilter: `${pk} IN (${idList})`,
    Fields: fields,
    ResultType: 'simple',
  }, args.ContextUser);

  if (!loadResult.Success) {
    throw new Error(`Failed to load audience records: ${loadResult.ErrorMessage}`);
  }

  // 3. Build recipients + collect skip reasons.
  const recipients: MessageRecipient[] = [];
  const skipped: AudienceSkipDetail[] = [];
  for (const row of loadResult.Results ?? []) {
    const recordId = String(row[pk]);
    const to = row[args.RecipientField];
    const toStr = to == null ? '' : String(to).trim();
    if (toStr.length === 0) {
      skipped.push({
        RecordID: recordId,
        Reason: 'MISSING_RECIPIENT_FIELD',
        Message: `Record has no ${args.RecipientField} value`,
      });
      continue;
    }
    const recipient = new MessageRecipient();
    recipient.To = toStr;
    if (args.FullNameField && row[args.FullNameField] != null) {
      recipient.FullName = String(row[args.FullNameField]);
    }
    recipient.ContextData = row;
    recipients.push(recipient);
  }

  // 4. Either preview-only return, or fan out via the engine.
  if (args.PreviewOnly) {
    return {
      TotalAudienceSize: total,
      WillReceiveCount: recipients.length,
      SkippedCount: skipped.length,
      Skipped: skipped,
      Results: [],
      PreviewOnly: true,
    };
  }

  const results = await CommunicationEngine.Instance.SendMessages(
    args.ProviderName,
    args.ProviderMessageTypeName,
    args.Message,
    recipients,
    false,
    args.Credentials,
  );

  return {
    TotalAudienceSize: total,
    WillReceiveCount: recipients.length,
    SkippedCount: skipped.length,
    Skipped: skipped,
    Results: results,
    PreviewOnly: false,
  };
}

function emptyResult(previewOnly: boolean): SendToAudienceResult {
  return {
    TotalAudienceSize: 0,
    WillReceiveCount: 0,
    SkippedCount: 0,
    Skipped: [],
    Results: [],
    PreviewOnly: previewOnly,
  };
}

function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}
