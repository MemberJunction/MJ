/**
 * @fileoverview Run history for Bulk Operations: every Record Process run (who/when/scope/status/counts),
 * drilling into the per-record outcome (the field diff persisted on each Process Run Detail). Read-only
 * audit surface. Generic + reusable.
 * @module @memberjunction/ng-record-process-studio
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { parseAppliedRunDetailChanges, displayRunValue, type RunDetailChange } from '../run-detail';

interface RawRun {
    ID: string; RecordProcessID: string; EntityID: string; Status: string;
    StartTime?: string | Date; SuccessCount?: number; ErrorCount?: number; SkippedCount?: number;
    TotalItemCount?: number; TriggeredBy?: string; SourceType?: string; DryRun?: boolean;
}
interface RunRow extends RawRun { ProcessName: string; EntityName: string; }

interface RawDetail { RecordID: string; Status: string; ResultPayload?: string; ErrorMessage?: string; }
interface DetailRow { RecordID: string; Status: string; Changes: RunDetailChange[]; ErrorMessage?: string; }

@Component({
    selector: 'mj-record-process-history',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MJButtonDirective],
    template: `
        @if (Mode === 'list') {
            <div class="rph-bar">
                <h3 class="rph-title">Run history</h3><span class="rph-spacer"></span>
                <button mjButton variant="flat" (click)="reload()"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>
            </div>
            @if (Loading) {
                <div class="rph-msg"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>
            } @else if (Runs.length === 0) {
                <div class="rph-msg">No runs yet.</div>
            } @else {
                <div class="rph-table">
                    <div class="rph-tr rph-head"><div>When</div><div>Operation</div><div>Entity</div><div>By</div><div>Status</div><div>Counts</div></div>
                    @for (r of Runs; track r.ID) {
                        <div class="rph-tr" (click)="openRun(r)">
                            <div class="rph-sub">{{ fmt(r.StartTime) }}</div>
                            <div class="rph-nm">{{ r.ProcessName }}</div>
                            <div>{{ r.EntityName }}</div>
                            <div class="rph-sub">{{ r.TriggeredBy || '—' }}</div>
                            <div><span class="st" [class.ok]="r.Status==='Completed'" [class.err]="r.Status==='Failed'"><span class="dot"></span> {{ r.Status }}</span>@if (r.DryRun) { <span class="dryrun" title="Compute-only preview — no changes were written">Dry Run</span> }</div>
                            <div class="counts">
                                <span class="cbadge ok">{{ r.SuccessCount || 0 }} ok</span>
                                @if (r.ErrorCount) { <span class="cbadge err">{{ r.ErrorCount }} err</span> }
                                @if (r.SkippedCount) { <span class="cbadge">{{ r.SkippedCount }} skip</span> }
                            </div>
                        </div>
                    }
                </div>
            }
        } @else {
            <div class="rph-bar">
                <button mjButton variant="flat" (click)="backToList()"><i class="fa-solid fa-arrow-left"></i> Back</button>
                <h3 class="rph-title">{{ OpenRunRow?.ProcessName }} · {{ fmt(OpenRunRow?.StartTime) }}</h3>
                @if (OpenRunRow?.DryRun) { <span class="dryrun" title="Compute-only preview — no changes were written">Dry Run</span> }
            </div>
            @if (DetailLoading) {
                <div class="rph-msg"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading details…</div>
            } @else if (Details.length === 0) {
                <div class="rph-msg">No per-record details recorded for this run.</div>
            } @else {
                <div class="rph-details">
                    @for (d of Details; track d.RecordID) {
                        <div class="rph-detrec">
                            <div class="rph-detkey">
                                <span class="st sm" [class.ok]="d.Status==='Succeeded'" [class.err]="d.Status==='Failed'" [class.muted]="d.Status==='Skipped'"><span class="dot"></span> {{ d.Status }}</span>
                                <div class="rph-rk">{{ d.RecordID }}</div>
                            </div>
                            <div class="rph-changes">
                                @for (c of d.Changes; track c.Field) {
                                    <div class="rph-chg"><span class="f">{{ c.Field }}</span>
                                        <span class="o">{{ disp(c.OldValue) }}</span><i class="fa-solid fa-arrow-right-long ar"></i><span class="nw">{{ disp(c.NewValue) }}</span></div>
                                }
                                @if (d.ErrorMessage) { <div class="rph-chg err-msg">{{ d.ErrorMessage }}</div> }
                                @if (d.Changes.length === 0 && !d.ErrorMessage) { <span class="rph-sub">no changes</span> }
                            </div>
                        </div>
                    }
                </div>
            }
        }
    `,
    styles: [`
        :host{display:block;color:var(--mj-text-primary)}
        .rph-bar{display:flex;align-items:center;gap:14px;margin-bottom:16px}
        .rph-title{margin:0;font-size:16px;font-weight:700}
        .rph-spacer{flex:1}
        .rph-bar button i{margin-right:6px}
        .rph-msg{padding:36px;text-align:center;color:var(--mj-text-muted)}
        .rph-table{border:1px solid var(--mj-border-subtle);border-radius:var(--mj-radius-md,10px);overflow:hidden}
        .rph-tr{display:grid;grid-template-columns:1.3fr 1.6fr 1.2fr .9fr 1fr 1.4fr;gap:14px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--mj-border-subtle);font-size:13px;cursor:pointer}
        .rph-tr:last-child{border-bottom:none}
        .rph-tr:not(.rph-head):hover{background:var(--mj-bg-surface-hover)}
        .rph-head{background:var(--mj-bg-surface-sunken);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mj-text-muted);font-weight:700;cursor:default}
        .rph-nm{font-weight:600}
        .rph-sub{color:var(--mj-text-muted);font-size:12px}
        .st{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px}
        .st .dot{width:8px;height:8px;border-radius:50%;background:var(--mj-text-disabled)}
        .st.ok .dot{background:var(--mj-status-success)} .st.ok{color:var(--mj-status-success-text)}
        .st.err .dot{background:var(--mj-status-error)} .st.err{color:var(--mj-status-error-text)}
        .st.muted{color:var(--mj-text-muted)}
        .st.sm{font-size:11.5px}
        .counts{display:flex;gap:6px;flex-wrap:wrap}
        .cbadge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--mj-bg-surface-sunken);color:var(--mj-text-secondary)}
        .dryrun{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:6px;margin-left:6px;background:var(--mj-status-info-bg);color:var(--mj-status-info-text);border:1px solid var(--mj-status-info-border)}
        .cbadge.ok{background:var(--mj-status-success-bg);color:var(--mj-status-success-text)}
        .cbadge.err{background:var(--mj-status-error-bg);color:var(--mj-status-error-text)}
        .rph-details{border:1px solid var(--mj-border-subtle);border-radius:var(--mj-radius-md,10px);overflow:hidden;max-height:560px;overflow-y:auto}
        .rph-detrec{display:grid;grid-template-columns:200px 1fr;gap:14px;padding:11px 16px;border-bottom:1px solid var(--mj-border-subtle)}
        .rph-detrec:last-child{border-bottom:none}
        .rph-detkey{display:flex;flex-direction:column;gap:5px}
        .rph-rk{font-family:var(--mj-font-mono,monospace);font-size:11px;color:var(--mj-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rph-chg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;padding:2px 0}
        .rph-chg .f{font-weight:700;min-width:120px}
        .rph-chg .o{color:var(--mj-text-muted);text-decoration:line-through}
        .rph-chg .nw{color:var(--mj-status-success-text);font-weight:600}
        .rph-chg .ar{color:var(--mj-text-disabled);font-size:11px}
        .rph-chg.err-msg{color:var(--mj-status-error-text)}
    `],
})
export class RecordProcessHistoryComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** Optional: show runs for one Record Process only. */
    @Input() RecordProcessID: string | null = null;

    public Mode: 'list' | 'detail' = 'list';
    public Loading = true;
    public DetailLoading = false;
    public Runs: RunRow[] = [];
    public Details: DetailRow[] = [];
    public OpenRunRow: RunRow | null = null;

    async ngOnInit(): Promise<void> {
        await this.reload();
    }

    async reload(): Promise<void> {
        this.Loading = true; this.cdr.detectChanges();
        const rv = this.Provider ? RunView.FromMetadataProvider(this.Provider) : new RunView();
        const filter = this.RecordProcessID ? `RecordProcessID='${this.RecordProcessID}'` : '';
        const [runs, procs] = await rv.RunViews([
            {
                EntityName: 'MJ: Process Runs',
                Fields: ['ID', 'RecordProcessID', 'EntityID', 'Status', 'StartTime', 'SuccessCount', 'ErrorCount', 'SkippedCount', 'TotalItemCount', 'TriggeredBy', 'SourceType', 'DryRun'],
                ExtraFilter: filter, OrderBy: 'StartTime DESC', MaxRows: 200, ResultType: 'simple',
            },
            { EntityName: 'MJ: Record Processes', Fields: ['ID', 'Name'], ResultType: 'simple' },
        ]);
        // Normalized-UUID keys → O(1), case-safe across SQL Server (upper) / PostgreSQL (lower).
        const nameByID = new Map<string, string>();
        if (procs.Success) for (const p of procs.Results as Array<{ ID: string; Name: string }>) nameByID.set(NormalizeUUID(p.ID), p.Name);
        const rawRuns = runs.Success ? (runs.Results as RawRun[]) : [];
        this.Runs = rawRuns.map((r) => ({
            ...r,
            ProcessName: nameByID.get(NormalizeUUID(r.RecordProcessID)) ?? '(deleted)',
            EntityName: this.ProviderToUse.EntityByID(r.EntityID)?.Name ?? r.EntityID,
        }));
        this.Loading = false;
        this.cdr.detectChanges();
    }

    async openRun(run: RunRow): Promise<void> {
        this.OpenRunRow = run; this.Mode = 'detail'; this.DetailLoading = true; this.Details = []; this.cdr.detectChanges();
        const rv = this.Provider ? RunView.FromMetadataProvider(this.Provider) : new RunView();
        const result = await rv.RunView<RawDetail>({
            EntityName: 'MJ: Process Run Details',
            Fields: ['RecordID', 'Status', 'ResultPayload', 'ErrorMessage'],
            ExtraFilter: `ProcessRunID='${run.ID}'`, OrderBy: 'Status, RecordID', MaxRows: 1000, ResultType: 'simple',
        });
        this.Details = (result.Success ? (result.Results ?? []) : []).map((d) => ({
            RecordID: d.RecordID, Status: d.Status, Changes: parseAppliedRunDetailChanges(d.ResultPayload), ErrorMessage: d.ErrorMessage,
        }));
        this.DetailLoading = false;
        this.cdr.detectChanges();
    }

    backToList(): void { this.Mode = 'list'; this.OpenRunRow = null; this.cdr.detectChanges(); }

    fmt(value?: string | Date): string {
        if (!value) return '—';
        const d = value instanceof Date ? value : new Date(value);
        return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    }
    disp(value: unknown): string { return displayRunValue(value); }
}
