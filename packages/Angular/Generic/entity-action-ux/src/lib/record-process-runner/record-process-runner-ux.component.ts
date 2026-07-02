/**
 * @fileoverview The flagship runtime-UX driver: runs a `MJ: Record Processes` (typically a FieldRules
 * bulk-update) as a safe, two-step flow — a server dry-run computes the exact per-record diff, the user
 * reviews it, and only on confirm does the real write happen. Registered as `RecordProcessRunnerUX`; an
 * entity action points its `RuntimeUXDriverClass` here and the host mounts it. All server work goes through
 * the typed {@link GraphQLRecordProcessClient}; the rich diff is read with `RunView` over
 * `MJ: Process Run Details`.
 * @module @memberjunction/ng-entity-action-ux
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import {
    RecordProcessRunNowOperation,
    type RecordProcessRunNowInput,
    type RecordProcessRunNowOutput,
    type RecordProcessScopeOverride,
} from '@memberjunction/core-entities';
import type { RemoteOpResult } from '@memberjunction/core';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, MJProgressBarComponent, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { BaseEntityActionRuntimeUX } from '../base-entity-action-runtime-ux';
import { buildRecordProcessScope, displayValue } from '../scope';

/** The run summary the runner renders, mapped from the operation's typed output. */
interface RunSummary {
    Success: boolean;
    ProcessRunID?: string;
    Processed: number;
    Succeeded: number;
    Errored: number;
    Skipped: number;
    Status?: string;
    ErrorMessage?: string;
}

/** The driver's flow state. */
type RunnerState = 'loading' | 'preview' | 'applying' | 'done' | 'error';

/** One computed field change (mirrors the engine's `FieldChange` for the bits the UI shows). */
interface DiffChange {
    Field: string;
    OldValue: unknown;
    NewValue: unknown;
    Applied: boolean;
    Changed: boolean;
    Error?: string;
}

/** The JSON payload persisted on each `MJ: Process Run Details.ResultPayload` for a FieldRules run. */
interface DiffPayload {
    DryRun: boolean;
    Changes: DiffChange[];
    ChangedFields: string[];
}

/** A per-record row of the preview table. */
interface RecordDiffRow {
    RecordID: string;
    Status: string;
    Changes: DiffChange[];
    ErrorMessage?: string;
}

/** Raw `MJ: Process Run Details` projection used to build the diff. */
interface RawDetail {
    RecordID: string;
    Status: string;
    ResultPayload?: string;
    ErrorMessage?: string;
}

@RegisterClass(BaseEntityActionRuntimeUX, 'RecordProcessRunnerUX')
@Component({
    selector: 'mj-record-process-runner-ux',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, MJProgressBarComponent, MJEmptyStateComponent],
    template: `
        <mj-dialog [Visible]="true" [Width]="760" [Title]="Title" [Closeable]="State !== 'applying'" (Close)="OnCancel()">
            <div class="rp-runner">
                @switch (State) {
                    @case ('loading') {
                        <div class="rp-status">
                            <mj-progress-bar Type="infinite"></mj-progress-bar>
                            <p>Computing a safe preview — no changes have been made yet…</p>
                        </div>
                    }
                    @case ('applying') {
                        <div class="rp-status">
                            <mj-progress-bar Type="infinite"></mj-progress-bar>
                            <p>Applying changes to {{ ChangedRecordCount }} {{ EntityLabel }}…</p>
                        </div>
                    }
                    @case ('error') {
                        <div class="rp-error">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <div>
                                <strong>Couldn't run this process</strong>
                                <p>{{ ErrorMessage }}</p>
                            </div>
                        </div>
                    }
                    @case ('done') {
                        <div class="rp-done">
                            <i class="fa-solid fa-circle-check"></i>
                            <div>
                                <strong>{{ DoneMessage }}</strong>
                                @if (AppliedResult?.Errored) {
                                    <p class="rp-warn">{{ AppliedResult?.Errored }} record(s) reported an error.</p>
                                }
                            </div>
                        </div>
                    }
                    @case ('preview') {
                        <div class="rp-summary">
                            <span class="rp-pill rp-pill--primary">{{ ChangedRecordCount }} of {{ PreviewResult?.Processed ?? 0 }} {{ EntityLabel }} will change</span>
                            <span class="rp-pill">{{ TotalChangeCount }} field update(s)</span>
                            @if (SkippedCount) { <span class="rp-pill rp-pill--muted">{{ SkippedCount }} unchanged</span> }
                            @if (ErroredCount) { <span class="rp-pill rp-pill--error">{{ ErroredCount }} error(s)</span> }
                        </div>

                        @if (DiffRows.length === 0) {
                            <mj-empty-state class="rp-empty" Size="compact" Variant="success"
                                Icon="fa-regular fa-circle-check"
                                Title="Nothing to change"
                                [Message]="'The rules did not match any of the selected ' + EntityLabel + '.'" />
                        } @else {
                            <div class="rp-diff" role="table">
                                @for (row of DiffRows; track row.RecordID) {
                                    <div class="rp-diff-record" role="row">
                                        <div class="rp-diff-key" [title]="row.RecordID">{{ row.RecordID }}</div>
                                        <div class="rp-diff-changes">
                                            @for (c of row.Changes; track c.Field) {
                                                <div class="rp-change">
                                                    <span class="rp-field">{{ c.Field }}</span>
                                                    <span class="rp-old">{{ Display(c.OldValue) }}</span>
                                                    <i class="fa-solid fa-arrow-right-long rp-arrow"></i>
                                                    <span class="rp-new">{{ Display(c.NewValue) }}</span>
                                                </div>
                                            }
                                            @if (row.ErrorMessage) {
                                                <div class="rp-change rp-change--error">{{ row.ErrorMessage }}</div>
                                            }
                                        </div>
                                    </div>
                                }
                            </div>
                            @if (Truncated) {
                                <p class="rp-truncated">Showing the first {{ DiffRows.length }} changed records. The apply step covers the full scope.</p>
                            }
                        }
                    }
                }
            </div>

            <mj-dialog-actions>
                @switch (State) {
                    @case ('preview') {
                        @if (HasChanges) {
                            <button mjButton variant="primary" (click)="Apply()">
                                <i class="fa-solid fa-check"></i> Apply {{ TotalChangeCount }} change(s)
                            </button>
                        }
                        <button mjButton (click)="OnCancel()">Cancel</button>
                    }
                    @case ('done') { <button mjButton variant="primary" (click)="Finish()">Done</button> }
                    @case ('error') { <button mjButton (click)="OnCancel()">Close</button> }
                }
            </mj-dialog-actions>
        </mj-dialog>
    `,
    styles: [`
        .rp-runner { min-height: 120px; color: var(--mj-text-primary); }
        .rp-status { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px 12px; color: var(--mj-text-secondary); }
        .rp-status mj-progress-bar { width: 60%; }
        .rp-error, .rp-done { display: flex; gap: 14px; align-items: flex-start; padding: 16px; border-radius: var(--mj-radius-md, 8px); }
        .rp-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
        .rp-done { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
        .rp-error i, .rp-done i { font-size: 22px; margin-top: 2px; }
        .rp-error p, .rp-done p { margin: 4px 0 0; }
        .rp-warn { color: var(--mj-status-warning-text); }
        .rp-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
        .rp-pill { padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary); }
        .rp-pill--primary { background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface)); color: var(--mj-brand-primary); }
        .rp-pill--error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
        .rp-pill--muted { background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); }
        .rp-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px; color: var(--mj-text-muted); }
        .rp-empty i { font-size: 26px; color: var(--mj-status-success); }
        .rp-diff { max-height: 420px; overflow-y: auto; border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md, 8px); }
        .rp-diff-record { display: grid; grid-template-columns: 180px 1fr; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--mj-border-subtle); }
        .rp-diff-record:last-child { border-bottom: none; }
        .rp-diff-key { font-family: var(--mj-font-mono, monospace); font-size: 12px; color: var(--mj-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rp-change { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 2px 0; font-size: 13px; }
        .rp-change--error { color: var(--mj-status-error-text); }
        .rp-field { font-weight: 600; min-width: 120px; }
        .rp-old { color: var(--mj-text-muted); text-decoration: line-through; }
        .rp-new { color: var(--mj-status-success-text); font-weight: 600; }
        .rp-arrow { color: var(--mj-text-disabled); font-size: 11px; }
        .rp-truncated { margin-top: 10px; font-size: 12px; color: var(--mj-text-muted); }
        button i { margin-right: 6px; }
    `],
})
export class RecordProcessRunnerUXComponent extends BaseEntityActionRuntimeUX {
    private cdr = inject(ChangeDetectorRef);

    /** Cap on preview rows we render (the apply step always covers the full scope). */
    private static readonly MAX_PREVIEW_ROWS = 500;

    public State: RunnerState = 'loading';
    public ErrorMessage = '';
    public DiffRows: RecordDiffRow[] = [];
    public PreviewResult?: RunSummary;
    public AppliedResult?: RunSummary;
    public ChangedRecordCount = 0;
    public TotalChangeCount = 0;
    public Truncated = false;

    get Title(): string { return this.Context?.ActionLabel || 'Run Record Process'; }
    get EntityLabel(): string { return this.Context?.EntityInfo?.DisplayName || this.Context?.EntityInfo?.Name || 'records'; }
    get HasChanges(): boolean { return this.ChangedRecordCount > 0; }
    get SkippedCount(): number { return this.PreviewResult?.Skipped ?? 0; }
    get ErroredCount(): number { return this.PreviewResult?.Errored ?? 0; }
    get DoneMessage(): string {
        const r = this.AppliedResult;
        return r ? `Updated ${r.Succeeded} ${this.EntityLabel}.` : 'Done.';
    }

    /** Step 1: run a dry-run on the server and load the resulting per-record diff. */
    async Start(): Promise<void> {
        const recordProcessID = this.recordProcessID();
        if (!recordProcessID) {
            this.toError('This action has no RecordProcessID configured.');
            return;
        }
        try {
            const preview = await this.runOp(recordProcessID, true);
            this.PreviewResult = preview;
            if (!preview.Success) {
                this.toError(preview.ErrorMessage || 'The preview could not be computed.');
                return;
            }
            if (preview.ProcessRunID) {
                await this.loadDiff(preview.ProcessRunID);
            }
            this.State = 'preview';
            this.cdr.detectChanges();
        } catch (e) {
            this.toError(e instanceof Error ? e.message : String(e));
        }
    }

    /** Step 2: the user confirmed — run for real. */
    async Apply(): Promise<void> {
        const recordProcessID = this.recordProcessID();
        if (!recordProcessID) return;
        this.State = 'applying';
        this.cdr.detectChanges();
        try {
            const result = await this.runOp(recordProcessID, false);
            this.AppliedResult = result;
            if (!result.Success) {
                this.toError(result.ErrorMessage || 'The changes could not be applied.');
                return;
            }
            this.State = 'done';
            this.cdr.detectChanges();
        } catch (e) {
            this.toError(e instanceof Error ? e.message : String(e));
        }
    }

    /** Closes after a successful apply, telling the host to refresh. */
    Finish(): void {
        this.Completed.emit({ Completed: true, RefreshData: true, Message: this.DoneMessage });
    }

    /** Dismiss without applying (also used for the error/close button). */
    OnCancel(): void {
        if (this.State === 'applying') return; // don't allow dismiss mid-write
        this.Cancelled.emit();
    }

    /** Renders a value for the diff table (delegates to the pure helper). */
    Display(value: unknown): string {
        return displayValue(value);
    }

    /**
     * Runs the `RecordProcess.RunNow` Remote Operation and maps its typed output to a {@link RunSummary}.
     * `Execute` routes through the host's provider — marshalled over the generic `ExecuteRemoteOperation`
     * transport on the client, in-process on the server — so there is no bespoke resolver/client.
     */
    private async runOp(recordProcessID: string, dryRun: boolean): Promise<RunSummary> {
        const input: RecordProcessRunNowInput = { recordProcessID, scope: this.buildScope(), dryRun };
        const result: RemoteOpResult<RecordProcessRunNowOutput> =
            await new RecordProcessRunNowOperation().Execute(input, { provider: this.Context?.Provider ?? undefined });
        const o = result.Output;
        const completed = result.Success && o?.status === 'Completed';
        return {
            Success: completed,
            ProcessRunID: o?.processRunID,
            Processed: o?.processed ?? 0,
            Succeeded: o?.success ?? 0,
            Errored: o?.error ?? 0,
            Skipped: o?.skipped ?? 0,
            Status: o?.status,
            ErrorMessage: result.ErrorMessage ?? o?.errorMessage ?? (o && o.status !== 'Completed' ? `Run ended with status '${o.status}'` : undefined),
        };
    }

    /** Reads `MJ: Process Run Details` for the dry-run and builds the per-record diff rows. */
    private async loadDiff(processRunID: string): Promise<void> {
        const rv = await (this.Context?.Provider ? RunView.FromMetadataProvider(this.Context.Provider) : new RunView()).RunView({
            EntityName: 'MJ: Process Run Details',
            ExtraFilter: `ProcessRunID='${processRunID}'`,
            Fields: ['RecordID', 'Status', 'ResultPayload', 'ErrorMessage'],
            OrderBy: 'RecordID',
            MaxRows: RecordProcessRunnerUXComponent.MAX_PREVIEW_ROWS,
            ResultType: 'simple',
        });
        if (!rv.Success) return;

        const rows: RecordDiffRow[] = [];
        let changedRecords = 0;
        let totalChanges = 0;
        for (const detail of rv.Results as RawDetail[]) {
            const payload = detail.ResultPayload ? SafeJSONParse<DiffPayload>(detail.ResultPayload) : undefined;
            const changes = (payload?.Changes ?? []).filter((c) => c.Applied && c.Changed && !c.Error);
            if (changes.length > 0) {
                changedRecords++;
                totalChanges += changes.length;
            }
            if (changes.length > 0 || detail.ErrorMessage) {
                rows.push({ RecordID: detail.RecordID, Status: detail.Status, Changes: changes, ErrorMessage: detail.ErrorMessage });
            }
        }
        this.DiffRows = rows;
        this.ChangedRecordCount = changedRecords;
        this.TotalChangeCount = totalChanges;
        this.Truncated = (this.PreviewResult?.Processed ?? 0) > RecordProcessRunnerUXComponent.MAX_PREVIEW_ROWS;
    }

    /** Builds the engine scope from the host-supplied context (delegates to the pure helper). */
    private buildScope(): RecordProcessScopeOverride {
        return buildRecordProcessScope(this.Context);
    }

    private recordProcessID(): string | undefined {
        const id = this.Context?.Config?.['RecordProcessID'];
        return typeof id === 'string' && id.length > 0 ? id : undefined;
    }

    private toError(message: string): void {
        this.ErrorMessage = message;
        this.State = 'error';
        this.cdr.detectChanges();
    }
}
