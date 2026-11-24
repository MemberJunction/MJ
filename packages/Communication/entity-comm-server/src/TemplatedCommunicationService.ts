import { CommunicationEngine } from '@memberjunction/communication-engine';
import {
  CommunicationEngineBase,
  ComplianceObligations,
  EndpointTarget,
  EvaluateEligibilityResult,
  PrincipalAttributes,
  PrincipalRecordRef,
  RenderAndSendParams,
  ResolvedEndpoint,
  SendableRecipient,
  SendingEnvelope,
  SendToPrincipalsParams,
  SendV2RecipientOutcome,
  SendV2Result,
  ITemplatedCommunicationService,
} from '@memberjunction/communication-types';
import {
  EntityInfo,
  LogError,
  Metadata,
  RunView,
  RunViewParams,
  UserInfo,
} from '@memberjunction/core';
import {
  MJTemplateContentEntity,
  MJTemplateEntityExtended,
  MJTemplateParamEntity,
} from '@memberjunction/core-entities';
import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';
import type { RequestProvider } from './entity-communications';

/**
 * Settings for {@link TemplatedCommunicationService}, applied with `Configure()`. MJServer sets
 * `EnqueueWork` and `ResolveUser` at startup.
 */
export interface TemplatedCommunicationConfig {
  /** Number of sendable recipients per `comms.render` batch. Defaults to 50. */
  BatchSize?: number;
  /** Optional work-queue publisher for `comms.render` batches. */
  EnqueueWork?: (taskType: 'comms.render', payload: RenderBatchPayload) => Promise<void>;
  /** Optional user resolver so async `comms.render` workers enforce the acting user's RLS/FLS. */
  ResolveUser?: (userID: string) => UserInfo | undefined;
}

/**
 * A sendable recipient as carried in a `comms.render` work item: the gate's decision plus the
 * caller's per-recipient data.
 */
export interface RenderBatchRecipient {
  Principal: PrincipalRecordRef;
  Endpoint: ResolvedEndpoint;
  Decision: 'Allowed' | 'Deferred';
  DeferUntil?: Date;
  Obligations: ComplianceObligations;
  SenderTemplateContext?: Record<string, unknown>;
  PrincipalAttributes?: PrincipalAttributes;
  ContextData?: Record<string, unknown>;
  CorrelationData?: Record<string, unknown>;
}

/** Payload of one `comms.render` work item. */
export interface RenderBatchPayload {
  /** `MJ: Communication Runs` ID shared by every batch of the send. */
  CommunicationRunID: string;
  /** The envelope of the send. */
  Envelope: SendingEnvelope;
  /** `MJ: Entities` ID of the recipients' entity, for related-entity template parameters. */
  EntityID?: string;
  /** Template IDs and shared template data, as given to `RenderAndSend()`. */
  Templates: {
    SubjectTemplateID?: string;
    BodyTemplateID?: string;
    HTMLBodyTemplateID?: string;
    SharedContextData?: Record<string, unknown>;
  };
  /** Whether to append the compliance footer when the rendered body lacks it. */
  AutoAppendComplianceFooter: boolean;
  /** The sendable recipients in this batch. */
  Recipients: RenderBatchRecipient[];
  /** Acting user ID so async `comms.render` workers enforce RLS/FLS when loading template data. */
  ActingUserID?: string;
}

/** The rendered content for one recipient. */
export interface RenderedRecipientPayload {
  Recipient: RenderBatchRecipient;
  Subject?: string;
  Body?: string;
  HTMLBody?: string;
}

/** Result of {@link TemplatedCommunicationService.RenderAndPreview}. */
export interface RenderPreviewResult {
  /** Number of recipients passed in. */
  TotalCount: number;
  /** Rendered content for each sendable recipient. */
  Rendered: RenderedRecipientPayload[];
  /** Recipients the gate blocked. */
  Blocked: EvaluateEligibilityResult['Blocked'];
}

interface ResolvedTemplateSet {
  SubjectTemplate?: MJTemplateEntityExtended;
  BodyTemplate?: MJTemplateEntityExtended;
  HTMLBodyTemplate?: MJTemplateEntityExtended;
}

interface RelatedEntityData {
  paramName: string;
  data: Record<string, unknown>[];
}

const DEFAULT_BATCH_SIZE = 50;

function principalKey(ref: PrincipalRecordRef): string {
  return `${ref.EntityID.trim().toLowerCase()}:${ref.RecordID}`;
}

/**
 * Layer 2 templated communication service.
 *
 * Evaluates pre-flight compliance eligibility before any related-entity queries or template renders,
 * validates template parameter alignment, batches sendable recipients into `comms.render` work items
 * (or renders inline for previews/legacy callers), injects `{ Sender, Recipient, Comms: { Obligations } }`,
 * and delegates final dispatch to `CommunicationEngine.Instance.Send()`.
 */
export class TemplatedCommunicationService
  extends BaseSingleton<TemplatedCommunicationService>
  implements ITemplatedCommunicationService
{
  private config: TemplatedCommunicationConfig = {};

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): TemplatedCommunicationService {
    return super.getInstance<TemplatedCommunicationService>();
  }

  /** Merges settings into the current configuration. */
  public Configure(config: TemplatedCommunicationConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Evaluates eligibility first, so nothing is rendered for a blocked recipient; then renders and
   * sends. In `'Inline'` mode, or when no work-queue publisher is configured, rendering and sending
   * happen in the calling process and per-recipient outcomes are returned. Otherwise the sendable
   * recipients are published as `comms.render` batches and the result has `IsAsyncRun: true`.
   *
   * @param params - Envelope, recipients, templates and render options.
   * @param contextUser - The acting user. Template data is loaded as this user, in async batches
   *   too.
   * @param provider - Metadata/RunView provider for the request, when not the default.
   */
  public async RenderAndSend(
    params: RenderAndSendParams,
    contextUser?: UserInfo,
    provider?: RequestProvider,
  ): Promise<SendV2Result> {
    const user = contextUser ?? CommunicationEngine.Instance.ContextUser;
    if (!CommunicationEngine.Instance.Loaded) {
      await CommunicationEngine.Instance.Config(false, user, provider);
    }

    // Step 1: Pre-flight compliance eligibility BEFORE any related-entity RunView or template render
    const eligibility = await CommunicationEngine.Instance.EvaluateEligibility(
      {
        Envelope: params.Envelope,
        Recipients: params.Recipients.map((r) => ({
          Principal: r.Principal,
          Endpoint: r.Endpoint,
        })),
      },
      user,
    );

    const blockedOutcomes = this.mapBlockedOutcomes(eligibility);
    if (eligibility.Sendable.length === 0) {
      return {
        Success: true,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: eligibility.Blocked.length,
        DeferredCount: 0,
        Outcomes: blockedOutcomes,
      };
    }

    // Step 2: Resolve templates and validate parameter alignment across Subject/Body/HTMLBody
    const resolvedTemplates = await this.resolveTemplates(params.Templates, user, provider);
    this.ValidateTemplateContextParamAlignment(resolvedTemplates);

    const sendableItems = this.buildRenderBatchRecipients(eligibility.Sendable, params.Recipients);
    const autoAppendFooter = params.AutoAppendComplianceFooter ?? false;

    // Step 4: Inline mode (PreviewOnly or legacy IncludeProcessedMessages = true)
    if (params.RenderMode === 'Inline') {
      return this.executeInlineRenderAndSend(
        params,
        sendableItems,
        resolvedTemplates,
        autoAppendFooter,
        blockedOutcomes,
        user,
        provider,
      );
    }

    // Step 3: Standard WorkQueue mode
    const run = await CommunicationEngineBase.Instance.StartRun();
    if (!run) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: eligibility.Blocked.length,
        DeferredCount: 0,
        Outcomes: blockedOutcomes,
        ErrorMessage: 'Failed to create communication run',
      };
    }

    const batchSize = this.config.BatchSize ?? DEFAULT_BATCH_SIZE;
    const batches = this.chunkArray(sendableItems, batchSize);

    if (this.config.EnqueueWork) {
      for (const batch of batches) {
        const sanitizedBatch = batch.map((r) =>
          r.Principal?.RecordData
            ? {
                ...r,
                Principal: {
                  EntityID: r.Principal.EntityID,
                  RecordID: r.Principal.RecordID,
                },
              }
            : r,
        );
        const batchPayload: RenderBatchPayload = {
          CommunicationRunID: run.ID,
          Envelope: params.Envelope,
          EntityID: params.EntityID,
          Templates: params.Templates,
          AutoAppendComplianceFooter: autoAppendFooter,
          Recipients: sanitizedBatch,
          ActingUserID: user?.ID,
        };
        await this.config.EnqueueWork('comms.render', batchPayload);
      }

      return {
        Success: true,
        CommunicationRunID: run.ID,
        IsAsyncRun: true,
        TotalCount: params.Recipients.length,
        QueuedCount: sendableItems.length,
        BlockedCount: eligibility.Blocked.length,
        DeferredCount: 0,
        Outcomes: blockedOutcomes,
      };
    }

    // In-process fallback when no EnqueueWork handler is registered
    const allOutcomes: SendV2RecipientOutcome[] = [...blockedOutcomes];
    let queuedCount = 0;
    let deferredCount = 0;
    let allSucceeded = true;
    const errors: string[] = [];

    for (const batch of batches) {
      const batchPayload: RenderBatchPayload = {
        CommunicationRunID: run.ID,
        Envelope: params.Envelope,
        EntityID: params.EntityID,
        Templates: params.Templates,
        AutoAppendComplianceFooter: autoAppendFooter,
        Recipients: batch,
        // The render step refuses a batch that does not say who it renders as. The queued path
        // above sets this; the in-process path has to as well.
        ActingUserID: user?.ID,
      };
      const batchResult = await this.HandleRenderBatch(batchPayload, user, provider);
      if (!batchResult.Success) {
        allSucceeded = false;
        if (batchResult.ErrorMessage) errors.push(batchResult.ErrorMessage);
      }
      queuedCount += batchResult.QueuedCount;
      deferredCount += batchResult.DeferredCount;
      if (batchResult.Outcomes) {
        allOutcomes.push(...batchResult.Outcomes);
      }
    }

    if (!(await CommunicationEngineBase.Instance.EndRun(run))) {
      LogError(`TemplatedCommunicationService: failed to finalize CommunicationRun ${run.ID}`);
    }

    return {
      Success: allSucceeded,
      CommunicationRunID: run.ID,
      IsAsyncRun: false,
      TotalCount: params.Recipients.length,
      QueuedCount: queuedCount,
      BlockedCount: eligibility.Blocked.length,
      DeferredCount: deferredCount,
      Outcomes: allOutcomes,
      ErrorMessage: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Evaluates eligibility, validates template alignment, and renders all sendable recipients
   * inline without dispatching to a provider (used for V1 `PreviewOnly` compatibility).
   */
  public async RenderAndPreview(
    params: RenderAndSendParams,
    contextUser?: UserInfo,
    provider?: RequestProvider,
  ): Promise<RenderPreviewResult> {
    const user = contextUser ?? CommunicationEngine.Instance.ContextUser;
    if (!CommunicationEngine.Instance.Loaded) {
      await CommunicationEngine.Instance.Config(false, user, provider);
    }

    const eligibility = await CommunicationEngine.Instance.EvaluateEligibility(
      {
        Envelope: params.Envelope,
        Recipients: params.Recipients.map((r) => ({
          Principal: r.Principal,
          Endpoint: r.Endpoint,
        })),
      },
      user,
    );

    if (eligibility.Sendable.length === 0) {
      return {
        TotalCount: params.Recipients.length,
        Rendered: [],
        Blocked: eligibility.Blocked,
      };
    }

    const resolvedTemplates = await this.resolveTemplates(params.Templates, user, provider);
    this.ValidateTemplateContextParamAlignment(resolvedTemplates);

    const sendableItems = this.buildRenderBatchRecipients(eligibility.Sendable, params.Recipients);
    const rendered = await this.RenderBatchInline(
      sendableItems,
      resolvedTemplates,
      params.Templates.SharedContextData,
      params.EntityID,
      params.AutoAppendComplianceFooter ?? false,
      user,
      provider,
    );

    return {
      TotalCount: params.Recipients.length,
      Rendered: rendered,
      Blocked: eligibility.Blocked,
    };
  }

  /**
   * Worker handler for `comms.render` batches.
   * Loads related data once for the batch's primary keys, renders templates with
   * `{ Sender, Recipient, Comms: { Obligations } }`, optionally appends compliance footer,
   * and dispatches via `CommunicationEngine.Instance.Send()`.
   */
  public async HandleRenderBatch(
    payload: RenderBatchPayload,
    contextUser?: UserInfo,
    provider?: RequestProvider,
  ): Promise<SendV2Result> {
    const user = contextUser ?? CommunicationEngine.Instance.ContextUser;
    if (!CommunicationEngine.Instance.Loaded) {
      await CommunicationEngine.Instance.Config(false, user, provider);
    }

    if (!payload.ActingUserID) {
      return {
        Success: false,
        CommunicationRunID: payload.CommunicationRunID,
        IsAsyncRun: false,
        TotalCount: payload.Recipients.length,
        QueuedCount: 0,
        BlockedCount: 0,
        DeferredCount: 0,
        ErrorMessage: 'ActingUserID is required for async template rendering',
      };
    }

    let renderUser: UserInfo;
    if (contextUser && UUIDsEqual(contextUser.ID, payload.ActingUserID)) {
      renderUser = contextUser;
    } else {
      const resolvedActingUser = this.config.ResolveUser?.(payload.ActingUserID);
      if (!resolvedActingUser) {
        return {
          Success: false,
          CommunicationRunID: payload.CommunicationRunID,
          IsAsyncRun: false,
          TotalCount: payload.Recipients.length,
          QueuedCount: 0,
          BlockedCount: 0,
          DeferredCount: 0,
          ErrorMessage: `Acting user '${payload.ActingUserID}' could not be resolved for async template rendering`,
        };
      }
      renderUser = resolvedActingUser;
    }

    const resolvedTemplates = await this.resolveTemplates(payload.Templates, renderUser, provider);
    const rendered = await this.RenderBatchInline(
      payload.Recipients,
      resolvedTemplates,
      payload.Templates.SharedContextData,
      payload.EntityID,
      payload.AutoAppendComplianceFooter,
      renderUser,
      provider,
    );

    const sendParams: SendToPrincipalsParams = {
      CommunicationRunID: payload.CommunicationRunID,
      Envelope: payload.Envelope,
      Recipients: rendered.map((item) => ({
        Principal: item.Recipient.Principal,
        Endpoint: {
          CommunicationEndpointID: item.Recipient.Endpoint.CommunicationEndpointID,
          Address: item.Recipient.Endpoint.RawValue,
        },
        PayloadOverride: {
          Subject: item.Subject,
          Body: item.Body,
          HTMLBody: item.HTMLBody,
        },
        CorrelationData: item.Recipient.CorrelationData,
      })),
    };

    return CommunicationEngine.Instance.Send(sendParams, renderUser);
  }

  /**
   * Renders a batch of sendable recipients inline (1 related-entity RunView per Entity param
   * across all PKs in the batch), without dispatching to a provider.
   */
  public async RenderBatchInline(
    recipients: RenderBatchRecipient[],
    resolvedTemplates: ResolvedTemplateSet,
    sharedContextData: Record<string, unknown> | undefined,
    entityID: string | undefined,
    autoAppendComplianceFooter: boolean,
    contextUser: UserInfo,
    provider?: RequestProvider,
  ): Promise<RenderedRecipientPayload[]> {
    if (recipients.length === 0) return [];

    const hasTemplates = Boolean(
      resolvedTemplates.SubjectTemplate ||
        resolvedTemplates.BodyTemplate ||
        resolvedTemplates.HTMLBodyTemplate,
    );

    if (hasTemplates && !TemplateEngineServer.Instance.Loaded) {
      await TemplateEngineServer.Instance.Config(false, contextUser, provider);
    }

    const relatedData = hasTemplates
      ? await this.getRelatedData(resolvedTemplates, recipients, entityID, contextUser, provider)
      : [];

    const allParams = this.collectUniqueParams(resolvedTemplates);
    const results: RenderedRecipientPayload[] = [];

    for (const recipient of recipients) {
      const paramContext = this.buildParamContext(recipient, relatedData, allParams);
      const renderData: Record<string, unknown> = {
        ...(sharedContextData ?? {}),
        ...(recipient.ContextData ?? {}),
        ...paramContext,
        Sender: recipient.SenderTemplateContext ?? {},
        Recipient: {
          ...(recipient.Principal.RecordData ?? {}),
          ...(recipient.PrincipalAttributes ?? {}),
          Endpoint: recipient.Endpoint,
        },
        Comms: {
          Obligations: recipient.Obligations,
        },
      };

      const subject = await this.renderSingleField(
        resolvedTemplates.SubjectTemplate,
        ['HTML', 'Text'],
        renderData,
        contextUser,
        false,
      );
      let body = await this.renderSingleField(
        resolvedTemplates.BodyTemplate,
        ['Text'],
        renderData,
        contextUser,
        false,
      );
      let htmlBody = await this.renderSingleField(
        resolvedTemplates.HTMLBodyTemplate ?? resolvedTemplates.BodyTemplate,
        ['HTML'],
        renderData,
        contextUser,
        true,
      );

      if (!htmlBody && body && !resolvedTemplates.HTMLBodyTemplate) {
        htmlBody = body;
      }

      if (autoAppendComplianceFooter) {
        const footerHTML = this.buildComplianceFooterHTML(recipient.Obligations);
        const footerText = this.buildComplianceFooterText(recipient.Obligations);
        if (footerHTML && htmlBody && !htmlBody.includes('data-mj-compliance-footer')) {
          htmlBody = `${htmlBody}${footerHTML}`;
        }
        if (footerText && body !== undefined && !body.includes(footerText.trim())) {
          body = `${body}${footerText}`;
        }
      }

      results.push({
        Recipient: recipient,
        Subject: subject,
        Body: body,
        HTMLBody: htmlBody,
      });
    }

    return results;
  }

  /**
   * Validates that overlapping parameter names across Subject, Body, and HTMLBody templates
   * have compatible definitions (matching `Type`, and matching `Entity`/`LinkedParameterField`
   * for `Entity`-typed parameters).
   */
  public ValidateTemplateContextParamAlignment(templates: ResolvedTemplateSet): boolean {
    const list: MJTemplateEntityExtended[] = [];
    if (templates.SubjectTemplate) list.push(templates.SubjectTemplate);
    if (templates.BodyTemplate) list.push(templates.BodyTemplate);
    if (templates.HTMLBodyTemplate) list.push(templates.HTMLBodyTemplate);

    const seen = new Map<string, MJTemplateParamEntity>();
    for (const template of list) {
      for (const param of template.Params ?? []) {
        const existing = seen.get(param.Name);
        if (existing) {
          if (existing.Type !== param.Type) {
            throw new Error(`Parameter ${param.Name} has different types in different templates`);
          }
          if (
            param.Type === 'Entity' &&
            (existing.Entity !== param.Entity ||
              existing.LinkedParameterField !== param.LinkedParameterField)
          ) {
            throw new Error(
              `Parameter ${param.Name} has mismatched Entity or LinkedParameterField across templates`,
            );
          }
        } else {
          seen.set(param.Name, param);
        }
      }
    }
    return true;
  }

  private async executeInlineRenderAndSend(
    params: RenderAndSendParams,
    sendableItems: RenderBatchRecipient[],
    resolvedTemplates: ResolvedTemplateSet,
    autoAppendFooter: boolean,
    blockedOutcomes: SendV2RecipientOutcome[],
    user: UserInfo,
    provider?: RequestProvider,
  ): Promise<SendV2Result> {
    const rendered = await this.RenderBatchInline(
      sendableItems,
      resolvedTemplates,
      params.Templates.SharedContextData,
      params.EntityID,
      autoAppendFooter,
      user,
      provider,
    );

    const sendParams: SendToPrincipalsParams = {
      Envelope: params.Envelope,
      Recipients: rendered.map((item) => ({
        Principal: item.Recipient.Principal,
        Endpoint: {
          CommunicationEndpointID: item.Recipient.Endpoint.CommunicationEndpointID,
          Address: item.Recipient.Endpoint.RawValue,
        },
        PayloadOverride: {
          Subject: item.Subject,
          Body: item.Body,
          HTMLBody: item.HTMLBody,
        },
        CorrelationData: item.Recipient.CorrelationData,
      })),
    };

    const sendResult = await CommunicationEngine.Instance.Send(sendParams, user);
    return {
      ...sendResult,
      TotalCount: params.Recipients.length,
      BlockedCount: blockedOutcomes.length + sendResult.BlockedCount,
      Outcomes: [...blockedOutcomes, ...(sendResult.Outcomes ?? [])],
    };
  }

  private async resolveTemplates(
    templates: RenderAndSendParams['Templates'],
    contextUser: UserInfo,
    provider?: RequestProvider,
  ): Promise<ResolvedTemplateSet> {
    const ids = [
      templates.SubjectTemplateID,
      templates.BodyTemplateID,
      templates.HTMLBodyTemplateID,
    ].filter((id): id is string => Boolean(id));

    if (ids.length === 0) {
      return {};
    }

    if (!TemplateEngineServer.Instance.Loaded) {
      await TemplateEngineServer.Instance.Config(false, contextUser, provider);
    }

    const resolveOne = (id: string | undefined): MJTemplateEntityExtended | undefined => {
      if (!id) return undefined;
      const found = TemplateEngineServer.Instance.FindTemplateByID(id);
      if (!found) {
        throw new Error(`Template ${id} not found`);
      }
      return found;
    };

    return {
      SubjectTemplate: resolveOne(templates.SubjectTemplateID),
      BodyTemplate: resolveOne(templates.BodyTemplateID),
      HTMLBodyTemplate: resolveOne(templates.HTMLBodyTemplateID),
    };
  }

  private async renderSingleField(
    template: MJTemplateEntityExtended | undefined,
    contentTypes: string[],
    renderData: Record<string, unknown>,
    contextUser: UserInfo,
    autoescape: boolean,
  ): Promise<string | undefined> {
    if (!template) return undefined;

    let content: MJTemplateContentEntity | undefined;
    for (const ct of contentTypes) {
      content = template.GetHighestPriorityContent(ct);
      if (content) break;
    }
    if (!content) return undefined;

    const result = await TemplateEngineServer.Instance.RenderTemplate(
      template,
      content,
      renderData,
      true,
      true,
      { ContextUser: contextUser, autoescape },
    );

    if (!result.Success) {
      throw new Error(`Failed to render template ${template.Name}: ${result.Message}`);
    }
    return result.Output;
  }

  private async getRelatedData(
    templates: ResolvedTemplateSet,
    recipients: RenderBatchRecipient[],
    entityID: string | undefined,
    contextUser: UserInfo,
    provider?: RequestProvider,
  ): Promise<RelatedEntityData[]> {
    const entityParams = this.collectUniqueParams(templates).filter((p) => p.Type === 'Entity');
    if (entityParams.length === 0 || recipients.length === 0) {
      return [];
    }

    const md = provider ?? Metadata.Provider;
    const targetEntityID = entityID ?? recipients[0].Principal.EntityID;
    const entityInfo = md.Entities.find((e) => UUIDsEqual(e.ID, targetEntityID));
    const needsQuotes = entityInfo ? entityInfo.FirstPrimaryKey.NeedsQuotes : true; // first-pk-ok: FK target of Entity-param LinkedParameterField is single-column by design

    const uniquePKs = Array.from(new Set(recipients.map((r) => r.Principal.RecordID)));
    const quotes = needsQuotes ? "'" : '';
    const pkList = uniquePKs.map((pk) => `${quotes}${EscapeSQLString(pk)}${quotes}`).join(',');

    const out: RelatedEntityData[] = [];
    const rv = new RunView(provider);

    for (const param of entityParams) {
      const filter = `${param.LinkedParameterField} IN (${pkList})`;
      const finalFilter = param.ExtraFilter ? `(${filter}) AND (${param.ExtraFilter})` : filter;
      const rvParams: RunViewParams = {
        EntityName: param.Entity,
        ExtraFilter: finalFilter,
        ResultType: 'simple',
      };
      const result = await rv.RunView<Record<string, unknown>>(rvParams, contextUser);
      if (result && result.Success) {
        const relatedEntityInfo = md.EntityByName(param.Entity);
        out.push({
          paramName: param.Name,
          data: relatedEntityInfo
            ? this.stripDeniedReadFields(relatedEntityInfo, result.Results, contextUser)
            : result.Results,
        });
      }
    }

    return out;
  }

  private stripDeniedReadFields(
    entityInfo: EntityInfo,
    rows: Record<string, unknown>[],
    contextUser: UserInfo,
  ): Record<string, unknown>[] {
    if (!entityInfo.FieldLevelSecurityApplies) return rows;
    const denied = entityInfo.GetDeniedReadFields(contextUser);
    if (denied.size === 0) return rows;
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !denied.has(key.trim().toLowerCase())),
      ),
    );
  }

  private collectUniqueParams(templates: ResolvedTemplateSet): MJTemplateParamEntity[] {
    const list: MJTemplateEntityExtended[] = [];
    if (templates.SubjectTemplate) list.push(templates.SubjectTemplate);
    if (templates.BodyTemplate) list.push(templates.BodyTemplate);
    if (templates.HTMLBodyTemplate) list.push(templates.HTMLBodyTemplate);

    const seen = new Set<string>();
    const params: MJTemplateParamEntity[] = [];
    for (const t of list) {
      for (const p of t.Params ?? []) {
        if (!seen.has(p.Name)) {
          seen.add(p.Name);
          params.push(p);
        }
      }
    }
    return params;
  }

  private buildParamContext(
    recipient: RenderBatchRecipient,
    relatedData: RelatedEntityData[],
    params: MJTemplateParamEntity[],
  ): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    for (const p of params) {
      if (ctx[p.Name] !== undefined) continue;
      if (p.Type === 'Record') {
        ctx[p.Name] = recipient.Principal.RecordData ?? recipient.ContextData?.[p.Name] ?? {};
      } else if (p.Type === 'Entity') {
        const rel = relatedData.find((d) => d.paramName === p.Name);
        ctx[p.Name] = (rel?.data ?? []).filter(
          (row) => String(row[p.LinkedParameterField]) === recipient.Principal.RecordID,
        );
      }
    }
    return ctx;
  }

  private buildRenderBatchRecipients(
    sendable: SendableRecipient[],
    inputRecipients: RenderAndSendParams['Recipients'],
  ): RenderBatchRecipient[] {
    const inputByKey = new Map<string, RenderAndSendParams['Recipients'][number]>();
    for (const r of inputRecipients) {
      inputByKey.set(principalKey(r.Principal), r);
    }

    return sendable.map((s) => {
      const input = s.Principal ? inputByKey.get(principalKey(s.Principal)) : undefined;
      return {
        Principal: s.Principal ?? input?.Principal ?? { EntityID: '', RecordID: '' },
        Endpoint: s.Endpoint,
        Decision: s.Decision,
        DeferUntil: s.DeferUntil,
        Obligations: s.Obligations,
        SenderTemplateContext: s.SenderTemplateContext,
        PrincipalAttributes: s.PrincipalAttributes,
        ContextData: input?.ContextData,
        CorrelationData: input?.CorrelationData,
      };
    });
  }

  private mapBlockedOutcomes(eligibility: EvaluateEligibilityResult): SendV2RecipientOutcome[] {
    return eligibility.Blocked.map((b) => ({
      Principal: b.Principal,
      Endpoint: b.Endpoint,
      Status: 'Blocked',
      Reason: b.Reason,
      Detail: b.Detail,
    }));
  }

  private buildComplianceFooterHTML(obligations: ComplianceObligations): string | undefined {
    const parts: string[] = [];
    if (obligations.RequireSenderPostalAddress && obligations.SenderPostalAddress) {
      parts.push(`<span>${obligations.SenderPostalAddress}</span>`);
    }
    if (obligations.RequireFooterUnsubscribe && obligations.UnsubscribeURL) {
      parts.push(`<a href="${obligations.UnsubscribeURL}">Unsubscribe</a>`);
    }
    if (parts.length === 0) return undefined;
    return `<div data-mj-compliance-footer="true">${parts.join(' | ')}</div>`;
  }

  private buildComplianceFooterText(obligations: ComplianceObligations): string | undefined {
    const parts: string[] = [];
    if (obligations.RequireSenderPostalAddress && obligations.SenderPostalAddress) {
      parts.push(obligations.SenderPostalAddress);
    }
    if (obligations.RequireFooterUnsubscribe && obligations.UnsubscribeURL) {
      parts.push(`Unsubscribe: ${obligations.UnsubscribeURL}`);
    }
    if (parts.length === 0) return undefined;
    return `\n\n---\n${parts.join(' | ')}`;
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunkSize = Math.max(1, size);
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
