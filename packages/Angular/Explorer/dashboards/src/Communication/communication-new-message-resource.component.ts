import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
  ResourceData,
  MJCommunicationProviderEntity,
  MJCommunicationProviderMessageTypeEntity,
} from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import type { AudienceSource } from '@memberjunction/lists';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * "New Communication" — implements mockup 21. Composes an outbound
 * message against an `AudienceSource` (List / View / ad-hoc filter):
 *
 *   - Channel = MJ Communication Provider + Provider Message Type
 *   - Audience = picked via `<mj-audience-source-picker>`
 *   - Field mapping = which entity field carries the recipient address
 *
 * Server work happens via two existing Actions (no new GraphQL endpoint
 * needed):
 *
 *   - "Resolve Audience" — used by the "Preview" panel to show counts
 *      (TotalAudienceSize / WillReceive / Skipped) before sending.
 *   - "Send To Audience" — actually sends. Supports `PreviewOnly: true`
 *      to re-resolve + report counts with field-mapping applied without
 *      dispatching.
 *
 * Action invocation goes through the `RunAction` mutation (same path the
 * Action Test Harness uses).
 */

interface AudienceSummary {
  TotalAudienceSize: number;
  WillReceiveCount: number;
  SkippedCount: number;
  EntityName: string;
}

@RegisterClass(BaseResourceComponent, 'CommunicationsNewMessageResource')
@Component({
  standalone: false,
  selector: 'mj-communications-new-message-resource',
  template: `
    <div class="new-message-resource">
      <div class="page-header">
        <div class="title-block">
          <i class="fa-solid fa-message"></i>
          <h2>New Communication</h2>
        </div>
        <div class="header-actions">
          <button
            class="action-btn"
            (click)="onPreviewAudience()"
            [disabled]="!canPreview || isResolvingAudience || isSending">
            @if (isResolvingAudience) {
              <i class="fa-solid fa-spinner fa-spin"></i> Previewing…
            } @else {
              <i class="fa-solid fa-eye"></i> Preview Audience
            }
          </button>
          <button
            class="action-btn action-btn--primary"
            (click)="onSend()"
            [disabled]="!canSend || isResolvingAudience || isSending">
            @if (isSending) {
              <i class="fa-solid fa-spinner fa-spin"></i> Sending…
            } @else {
              <i class="fa-solid fa-paper-plane"></i> Send
            }
          </button>
        </div>
      </div>

      <div class="layout-grid">
        <!-- Message panel -->
        <div class="panel">
          <div class="panel-header">
            <i class="fa-solid fa-envelope"></i>
            <h3>Message</h3>
          </div>
          <div class="panel-body">
            @if (loadingProviders) {
              <mj-loading text="Loading channels..." size="small"></mj-loading>
            } @else {
              <label class="field-label">Channel</label>
              <select
                class="mj-input mj-select"
                [(ngModel)]="selectedProviderID"
                (ngModelChange)="onProviderChange()">
                <option [ngValue]="null">Select a channel…</option>
                @for (p of providers; track p.ID) {
                  <option [ngValue]="p.ID">{{ p.Name }}</option>
                }
              </select>

              @if (filteredMessageTypes.length > 0) {
                <label class="field-label">Message type</label>
                <select class="mj-input mj-select" [(ngModel)]="selectedMessageTypeID">
                  <option [ngValue]="null">Select a message type…</option>
                  @for (mt of filteredMessageTypes; track mt.ID) {
                    <option [ngValue]="mt.ID">{{ mt.Name }}</option>
                  }
                </select>
              }

              <label class="field-label">From</label>
              <input
                class="mj-input"
                type="text"
                [(ngModel)]="fromAddress"
                placeholder="sender@example.com" />

              <label class="field-label">Subject</label>
              <input
                class="mj-input"
                type="text"
                [(ngModel)]="subject"
                placeholder="Message subject" />

              <label class="field-label">Body</label>
              <textarea
                class="mj-input mj-textarea"
                [(ngModel)]="body"
                rows="10"
                placeholder="Hi {{ '{{FirstName}}' }},..."></textarea>
            }
          </div>
        </div>

        <!-- Audience panel -->
        <div class="panel">
          <div class="panel-header">
            <i class="fa-solid fa-bullseye"></i>
            <h3>Audience</h3>
          </div>
          <div class="panel-body">
            <mj-audience-source-picker
              [Provider]="Provider"
              [Source]="audienceSource"
              (SourceChange)="onAudienceSourceChange($event)">
            </mj-audience-source-picker>

            @if (audienceSource) {
              <label class="field-label field-label--spaced">Recipient field</label>
              <input
                class="mj-input"
                type="text"
                [(ngModel)]="recipientField"
                placeholder="e.g. Email" />
              <p class="field-hint">
                Field on the audience entity that holds the recipient address.
                Records with no value will be skipped.
              </p>
            }

            @if (audienceSummary) {
              <div class="summary-block" [class.summary-block--has-skips]="audienceSummary.SkippedCount > 0">
                <div class="summary-row">
                  <span class="summary-label">Total audience</span>
                  <span class="summary-value">{{ audienceSummary.TotalAudienceSize }}</span>
                </div>
                <div class="summary-row summary-row--will-receive">
                  <span class="summary-label">Will receive</span>
                  <span class="summary-value">{{ audienceSummary.WillReceiveCount }}</span>
                </div>
                @if (audienceSummary.SkippedCount > 0) {
                  <div class="summary-row summary-row--skipped">
                    <span class="summary-label">Skipped (missing {{ recipientField || 'recipient' }})</span>
                    <span class="summary-value">{{ audienceSummary.SkippedCount }}</span>
                  </div>
                }
                <div class="summary-row summary-row--entity">
                  <span class="summary-label">Entity</span>
                  <span class="summary-value">{{ audienceSummary.EntityName }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .new-message-resource {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 24px;
      height: 100%;
      overflow: auto;
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .title-block { display: flex; align-items: center; gap: 12px; }
    .title-block i { font-size: 20px; color: var(--mj-brand-primary); }
    .title-block h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--mj-text-primary); }
    .header-actions { display: flex; gap: 8px; }
    .action-btn {
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .action-btn:hover:not(:disabled) {
      background: var(--mj-bg-surface-hover);
    }
    .action-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .action-btn--primary {
      background: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
      color: var(--mj-text-inverse, white);
    }
    .action-btn--primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .layout-grid {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 1024px) {
      .layout-grid { grid-template-columns: 1fr; }
    }

    .panel {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-card);
    }
    .panel-header i { color: var(--mj-text-secondary); }
    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }
    .panel-body { padding: 16px; }

    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--mj-text-secondary);
      margin: 12px 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .field-label--spaced { margin-top: 20px; }
    .field-hint {
      font-size: 11.5px;
      color: var(--mj-text-muted);
      margin: 6px 0 0;
    }

    .summary-block {
      margin-top: 20px;
      padding: 12px 14px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
    }
    .summary-block--has-skips {
      border-color: var(--mj-status-warning);
      background: color-mix(in srgb, var(--mj-status-warning) 6%, var(--mj-bg-surface-card));
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 13px;
      padding: 4px 0;
    }
    .summary-row + .summary-row { border-top: 1px solid var(--mj-border-subtle); }
    .summary-label { color: var(--mj-text-secondary); }
    .summary-value { font-weight: 600; color: var(--mj-text-primary); }
    .summary-row--will-receive .summary-value { color: var(--mj-status-success); }
    .summary-row--skipped .summary-value { color: var(--mj-status-warning); }
    .summary-row--entity .summary-label,
    .summary-row--entity .summary-value {
      font-size: 11.5px;
      color: var(--mj-text-muted);
      font-weight: 500;
    }
  `],
})
export class CommunicationsNewMessageResource extends BaseResourceComponent implements OnInit, OnDestroy {
  // BaseResourceComponent already exposes a protected `destroy$` Subject.
  // Don't re-declare it here — the import is kept only for the rxjs type.
  // (See base class comment.)
  // Local lifecycle goes through super.ngOnDestroy().

  // Channel state
  public loadingProviders = true;
  public providers: MJCommunicationProviderEntity[] = [];
  public messageTypes: MJCommunicationProviderMessageTypeEntity[] = [];
  public selectedProviderID: string | null = null;
  public selectedMessageTypeID: string | null = null;

  // Message state
  public fromAddress = '';
  public subject = '';
  public body = '';

  // Audience state
  public audienceSource: AudienceSource | null = null;
  public recipientField = '';
  public audienceSummary: AudienceSummary | null = null;

  // Action IDs — looked up lazily on first use to avoid an extra RunView
  // on every page open. Cached for the session.
  private resolveAudienceActionID: string | null = null;
  private sendToAudienceActionID: string | null = null;

  public isResolvingAudience = false;
  public isSending = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private notificationService: MJNotificationService,
  ) {
    super();
  }

  override async ngOnInit(): Promise<void> {
    super.ngOnInit();
    await this.loadChannelMetadata();
    this.NotifyLoadComplete();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  public get filteredMessageTypes(): MJCommunicationProviderMessageTypeEntity[] {
    if (!this.selectedProviderID) return [];
    return this.messageTypes.filter(
      (mt) => mt.CommunicationProviderID === this.selectedProviderID,
    );
  }

  public get selectedProvider(): MJCommunicationProviderEntity | null {
    return this.providers.find((p) => p.ID === this.selectedProviderID) ?? null;
  }

  public get selectedMessageType(): MJCommunicationProviderMessageTypeEntity | null {
    return this.messageTypes.find((mt) => mt.ID === this.selectedMessageTypeID) ?? null;
  }

  public get canPreview(): boolean {
    return !!this.audienceSource && this.recipientField.trim().length > 0;
  }

  public get canSend(): boolean {
    return this.canPreview
      && !!this.selectedProviderID
      && !!this.selectedMessageTypeID
      && this.fromAddress.trim().length > 0;
  }

  public onProviderChange(): void {
    this.selectedMessageTypeID = null;
  }

  public onAudienceSourceChange(source: AudienceSource | null): void {
    this.audienceSource = source;
    this.audienceSummary = null;
  }

  /**
   * Preview the audience without sending — calls "Send To Audience" with
   * PreviewOnly=true. Surfaces the same total/will-receive/skipped tile
   * mockup 21 shows. Cheaper than `Resolve Audience` for our purposes
   * because it also evaluates the recipient-field skip rule.
   */
  public async onPreviewAudience(): Promise<void> {
    if (!this.canPreview) return;
    this.isResolvingAudience = true;
    this.audienceSummary = null;
    this.cdr.detectChanges();
    try {
      const actionID = await this.getSendToAudienceActionID();
      if (!actionID) {
        this.notificationService.CreateSimpleNotification(
          "Couldn't find the 'Send To Audience' action — make sure CodeGen has run.",
          'error', 5000,
        );
        return;
      }
      const result = await this.invokeAction(actionID, {
        Source: JSON.stringify(this.audienceSource!),
        RecipientField: this.recipientField.trim(),
        ProviderName: this.selectedProvider?.Name ?? 'Preview',
        ProviderMessageTypeName: this.selectedMessageType?.Name ?? 'Preview',
        From: this.fromAddress || 'preview@local',
        Subject: this.subject,
        Body: this.body,
        PreviewOnly: 'true',
      });

      const data = this.parseResultData(result);
      this.audienceSummary = {
        TotalAudienceSize: this.coerceNumber(data['TotalAudienceSize']),
        WillReceiveCount: this.coerceNumber(data['WillReceiveCount']),
        SkippedCount: this.coerceNumber(data['SkippedCount']),
        EntityName: this.audienceSource ? this.describeSource(this.audienceSource) : '',
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.notificationService.CreateSimpleNotification(`Preview failed: ${message}`, 'error', 5000);
    } finally {
      this.isResolvingAudience = false;
      this.cdr.detectChanges();
    }
  }

  public async onSend(): Promise<void> {
    if (!this.canSend) return;
    this.isSending = true;
    this.cdr.detectChanges();
    try {
      const actionID = await this.getSendToAudienceActionID();
      if (!actionID) {
        this.notificationService.CreateSimpleNotification(
          "Couldn't find the 'Send To Audience' action — make sure CodeGen has run.",
          'error', 5000,
        );
        return;
      }
      const result = await this.invokeAction(actionID, {
        Source: JSON.stringify(this.audienceSource!),
        RecipientField: this.recipientField.trim(),
        ProviderName: this.selectedProvider!.Name,
        ProviderMessageTypeName: this.selectedMessageType!.Name,
        From: this.fromAddress,
        Subject: this.subject,
        Body: this.body,
        PreviewOnly: 'false',
      });

      const data = this.parseResultData(result);
      const sent = this.coerceNumber(data['WillReceiveCount']) - this.coerceNumber(data['FailedCount']);
      const failed = this.coerceNumber(data['FailedCount']);
      const skipped = this.coerceNumber(data['SkippedCount']);
      const okOverall = (result.Success as boolean) === true && failed === 0;
      this.notificationService.CreateSimpleNotification(
        okOverall
          ? `Sent ${sent} message(s)${skipped > 0 ? ` (${skipped} skipped)` : ''}`
          : `Sent with errors: ${sent} sent, ${failed} failed, ${skipped} skipped`,
        okOverall ? 'success' : 'warning',
        okOverall ? 3000 : 7000,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.notificationService.CreateSimpleNotification(`Send failed: ${message}`, 'error', 5000);
    } finally {
      this.isSending = false;
      this.cdr.detectChanges();
    }
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  /**
   * One RunView pair on init: providers + their message types. Cached on
   * the component for the session — we don't go back to the DB on every
   * channel selection. Use RunViews (plural) so it's a single round trip.
   */
  private async loadChannelMetadata(): Promise<void> {
    this.loadingProviders = true;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const [providersResult, messageTypesResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Communication Providers',
          ExtraFilter: "Status='Active'",
          OrderBy: 'Name',
          ResultType: 'simple',
        },
        {
          EntityName: 'MJ: Communication Provider Message Types',
          ExtraFilter: "Status='Active'",
          OrderBy: 'Name',
          ResultType: 'simple',
        },
      ]);
      this.providers = (providersResult.Success ? providersResult.Results ?? [] : []) as MJCommunicationProviderEntity[];
      this.messageTypes = (messageTypesResult.Success ? messageTypesResult.Results ?? [] : []) as MJCommunicationProviderMessageTypeEntity[];
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.notificationService.CreateSimpleNotification(`Failed to load channels: ${message}`, 'error', 5000);
    } finally {
      this.loadingProviders = false;
      this.cdr.detectChanges();
    }
  }

  private async getSendToAudienceActionID(): Promise<string | null> {
    if (this.sendToAudienceActionID) return this.sendToAudienceActionID;
    const id = await this.lookupActionIDByName('Send To Audience');
    this.sendToAudienceActionID = id;
    return id;
  }

  private async lookupActionIDByName(name: string): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<{ ID: string }>({
      EntityName: 'MJ: Actions',
      ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
      Fields: ['ID'],
      ResultType: 'simple',
      MaxRows: 1,
    });
    if (!result.Success || !result.Results || result.Results.length === 0) return null;
    return String(result.Results[0].ID);
  }

  /**
   * Invoke an Action via the RunAction GraphQL mutation. Same pattern as
   * the Action Test Harness — kept inline here so the resource component
   * stays self-contained.
   */
  private async invokeAction(
    actionID: string,
    params: Record<string, string>,
  ): Promise<{ Success: boolean; Message: string; ResultCode: string; ResultData?: string }> {
    const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
    const query = `
      mutation RunAction($input: RunActionInput!) {
        RunAction(input: $input) {
          Success
          Message
          ResultCode
          ResultData
        }
      }
    `;
    const actionParams = Object.entries(params).map(([Name, Value]) => ({
      Name, Value, Type: 'string',
    }));
    const variables = { input: { ActionID: actionID, Params: actionParams, SkipActionLog: false } };
    const gqlResult = await provider.ExecuteGQL(query, variables);
    if (!gqlResult?.RunAction) {
      throw new Error('RunAction returned no result');
    }
    return gqlResult.RunAction;
  }

  private parseResultData(result: { ResultData?: string }): Record<string, unknown> {
    if (!result.ResultData) return {};
    try {
      const parsed = JSON.parse(result.ResultData);
      // RunAction returns either an object or an array of {Name,Value}.
      if (Array.isArray(parsed)) {
        const out: Record<string, unknown> = {};
        for (const item of parsed) {
          if (item && typeof item === 'object' && 'Name' in item && 'Value' in item) {
            out[String((item as { Name: unknown }).Name)] = (item as { Value: unknown }).Value;
          }
        }
        return out;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private coerceNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = Number(v); return isNaN(n) ? 0 : n; }
    return 0;
  }

  private describeSource(s: AudienceSource): string {
    switch (s.kind) {
      case 'list': return 'List';
      case 'view': return 'User View';
      case 'adhoc': return s.entityName;
    }
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> { return 'New Communication'; }
  async GetResourceIconClass(_data: ResourceData): Promise<string> { return 'fa-solid fa-pen-to-square'; }
}

/** Tree-shaking prevention */
export function LoadCommunicationsNewMessageResource() {}
