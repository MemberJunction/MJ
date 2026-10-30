import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { RemoteOpProgress } from '@memberjunction/core';
import { QueryRefreshExtractionOperation, UserInfoEngine } from '@memberjunction/core-entities';
import type { QueryRefreshExtractionOutput } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    MJButtonDirective,
    MJDialogActionsComponent,
    MJDialogComponent,
    MJProgressBarComponent,
} from '@memberjunction/ng-ui-components';
import { QueryRefreshReportComponent } from './query-refresh-report.component';
import {
    IsQueryRefreshScopeEmpty,
    QUERY_REFRESH_SKIP_DRY_RUN_SETTING,
    QueryRefreshHasChanges,
    QueryRefreshInputFor,
    QueryRefreshPercent,
} from './query-refresh-model';
import type { QueryRefreshPhase, QueryRefreshScope } from './query-refresh-model';

/**
 * `<mj-query-refresh-dialog>` — refreshes saved queries' metadata (fields, parameters, entities,
 * dependencies) from their SQL and the database server, through the `Query.RefreshExtraction`
 * remote operation.
 *
 * Opening it always starts with a dry run: the operation reports what would change and writes
 * nothing, live progress shows as each query is checked, and the report is shown for review. The
 * user then applies it, which runs the refresh for real and shows what was written. When
 * `AllowSkipDryRun` is set, the review offers a user setting, "skip the dry run for future query
 * refreshes"; with it on, a later opening applies straight away.
 *
 * Composite (L2): it calls the operation on `ProviderToUse` and reads and writes the user setting,
 * but never navigates: a query the user asks to open is emitted as `OpenQuery`.
 */
@Component({
    standalone: true,
    selector: 'mj-query-refresh-dialog',
    imports: [MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, MJProgressBarComponent, QueryRefreshReportComponent],
    templateUrl: './query-refresh-dialog.component.html',
    styleUrls: ['./query-refresh-dialog.component.css'],
})
export class QueryRefreshDialogComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);
    private _visible = false;
    /** Increments on every run, so a run the user has moved on from cannot overwrite a newer one. */
    private runSequence = 0;

    /** Which queries to refresh. */
    @Input() Scope: QueryRefreshScope | null = null;
    /** Names the scope in the dialog, e.g. `Query "Sales by Region"` or `Category "Reports"`. */
    @Input() ScopeLabel = '';
    @Input() Title = 'Refresh query metadata';
    /** Whether the user may turn on "skip the dry run for future query refreshes". */
    @Input() AllowSkipDryRun = false;
    /** Whether query names in the report are buttons that emit {@link OpenQuery}. */
    @Input() AllowOpenQuery = false;

    @Input()
    set Visible(value: boolean) {
        const opening = value && !this._visible;
        this._visible = value;
        // Start after this change detection pass has applied every input: a host that sets the
        // scope and opens the dialog together may bind Visible before Scope.
        if (opening) void Promise.resolve().then(() => { if (this._visible) return this.Start(); });
    }
    get Visible(): boolean {
        return this._visible;
    }

    /** The dialog was closed. */
    @Output() Closed = new EventEmitter<void>();
    /** A refresh was applied; carries its report. */
    @Output() Applied = new EventEmitter<QueryRefreshExtractionOutput>();
    /** The ID of a query the user asked to open from the report. */
    @Output() OpenQuery = new EventEmitter<string>();

    public Phase: QueryRefreshPhase = 'Idle';
    public Report: QueryRefreshExtractionOutput | null = null;
    public ErrorMessage: string | null = null;
    public Processed = 0;
    public Total: number | undefined = undefined;
    public ProgressMessage = '';
    public SkipDryRun = false;

    public get IsRunning(): boolean {
        return this.Phase === 'DryRunning' || this.Phase === 'Applying';
    }

    public get Percent(): number | null {
        return QueryRefreshPercent(this.Processed, this.Total);
    }

    public get CanApply(): boolean {
        return this.Phase === 'Review' && QueryRefreshHasChanges(this.Report);
    }

    /** Begins a refresh: a dry run, or straight to applying when the user turned dry runs off. */
    public async Start(): Promise<void> {
        this.Report = null;
        this.ErrorMessage = null;
        this.SkipDryRun = this.AllowSkipDryRun && this.readSkipDryRunSetting();
        if (IsQueryRefreshScopeEmpty(this.Scope)) {
            this.fail('Nothing is selected to refresh.');
            return;
        }
        await this.run(!this.SkipDryRun);
    }

    /** Applies the refresh the dry run reported. */
    public async Apply(): Promise<void> {
        if (this.IsRunning) return;
        await this.run(false);
    }

    /** Runs the dry run again, e.g. after the SQL or the database changed. */
    public async RunDryRunAgain(): Promise<void> {
        if (this.IsRunning) return;
        await this.run(true);
    }

    /** Turns the "skip the dry run for future query refreshes" setting on or off for this user. */
    public async OnSkipDryRunChange(value: boolean): Promise<void> {
        this.SkipDryRun = value;
        this.cdr.detectChanges();
        try {
            await UserInfoEngine.Instance.SetSetting(QUERY_REFRESH_SKIP_DRY_RUN_SETTING, value ? 'true' : 'false');
        } catch (error) {
            console.error('[query-refresh-dialog] Could not save the dry-run setting:', error);
        }
    }

    /** The setting's checkbox changed. */
    public async OnSkipDryRunToggled(event: Event): Promise<void> {
        const target = event.target;
        if (target instanceof HTMLInputElement) await this.OnSkipDryRunChange(target.checked);
    }

    public Close(): void {
        this.runSequence++;
        this._visible = false;
        this.Phase = 'Idle';
        this.Closed.emit();
        this.cdr.detectChanges();
    }

    private async run(dryRun: boolean): Promise<void> {
        const scope = this.Scope;
        if (!scope) return;
        const sequence = ++this.runSequence;
        this.beginPhase(dryRun ? 'DryRunning' : 'Applying');
        try {
            const result = await new QueryRefreshExtractionOperation().Execute(QueryRefreshInputFor(scope, dryRun), {
                provider: this.ProviderToUse,
                onProgress: p => this.onProgress(sequence, p),
            });
            if (sequence !== this.runSequence) return;
            if (!result.Success || !result.Output) {
                this.fail(result.ErrorMessage || 'The refresh did not complete.');
                return;
            }
            this.finish(result.Output, dryRun);
        } catch (error) {
            if (sequence === this.runSequence) this.fail(error instanceof Error ? error.message : String(error));
        }
    }

    private beginPhase(phase: QueryRefreshPhase): void {
        this.Phase = phase;
        this.ErrorMessage = null;
        this.Processed = 0;
        this.Total = undefined;
        this.ProgressMessage = '';
        this.cdr.detectChanges();
    }

    private onProgress(sequence: number, progress: RemoteOpProgress): void {
        if (sequence !== this.runSequence) return;
        this.Processed = progress.Processed ?? this.Processed;
        this.Total = progress.Total ?? this.Total;
        this.ProgressMessage = progress.Message ?? '';
        this.cdr.detectChanges();
    }

    private finish(output: QueryRefreshExtractionOutput, dryRun: boolean): void {
        this.Report = output;
        this.Phase = dryRun ? 'Review' : 'Done';
        this.cdr.detectChanges();
        if (!dryRun) this.Applied.emit(output);
    }

    private fail(message: string): void {
        this.ErrorMessage = message;
        this.Phase = 'Failed';
        this.cdr.detectChanges();
    }

    private readSkipDryRunSetting(): boolean {
        try {
            return UserInfoEngine.Instance.GetSetting(QUERY_REFRESH_SKIP_DRY_RUN_SETTING) === 'true';
        } catch {
            return false;
        }
    }
}
