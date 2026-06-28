/**
 * @fileoverview The Bulk Operations hub: lists the org's Record Processes, lets a user create / edit one
 * (via the embedded {@link RecordProcessEditorComponent}), and run any of them on demand (mounting the
 * same dry-run → confirm runner used from a grid). Generic + reusable — Explorer's Bulk Operations app
 * hosts it, but any MJ app can drop it in.
 * @module @memberjunction/ng-record-process-studio
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';
import { EntityActionUXHostComponent, type EntityActionUXContext, type EntityActionUXResult } from '@memberjunction/ng-entity-action-ux';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { RecordProcessEditorComponent } from '../record-process-editor/record-process-editor.component';

/** A row of the process list (read-only projection). */
interface ProcessRow {
    ID: string;
    Name: string;
    Description?: string;
    Entity: string;
    EntityID: string;
    WorkType: string;
    Status: string;
    ScopeType: string;
    ScopeFilter?: string;
    ScopeViewID?: string;
    ScopeListID?: string;
}

@Component({
    selector: 'mj-record-process-studio',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RecordProcessEditorComponent, EntityActionUXHostComponent, MJButtonDirective, MJEmptyStateComponent],
    template: `
        @if (Mode === 'list') {
            <div class="rps-bar">
                <div class="rps-search"><i class="fa-solid fa-magnifying-glass"></i>
                    <input class="mj-input" placeholder="Search bulk operations…" [value]="Search" (input)="onSearch($event)"></div>
                <span class="rps-spacer"></span>
                <button mjButton variant="flat" (click)="reload()"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>
                <button mjButton variant="primary" (click)="New()"><i class="fa-solid fa-plus"></i> New operation</button>
            </div>

            @if (Loading) {
                <div class="rps-msg"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>
            } @else if (Filtered.length === 0) {
                <mj-empty-state class="rps-empty"
                    Icon="fa-solid fa-list-check"
                    Title="No bulk operations yet"
                    ActionText="Create one"
                    ActionIcon="fa-solid fa-plus"
                    (Action)="New()" />
            } @else {
                <div class="rps-table">
                    <div class="rps-tr rps-head">
                        <div>Operation</div><div>Entity</div><div>Type</div><div>Status</div><div class="ta-r">Actions</div>
                    </div>
                    @for (p of Filtered; track p.ID) {
                        <div class="rps-tr" (click)="Edit(p)">
                            <div><div class="rps-nm">{{ p.Name }}</div>@if (p.Description) {<div class="rps-sub">{{ p.Description }}</div>}</div>
                            <div>{{ p.Entity }}</div>
                            <div><span class="pill purple">{{ workLabel(p.WorkType) }}</span></div>
                            <div><span class="pill" [class.ok]="p.Status==='Active'" [class.warn]="p.Status==='Draft'" [class.muted]="p.Status==='Disabled'">{{ p.Status }}</span></div>
                            <div class="ta-r rps-acts" (click)="$event.stopPropagation()">
                                <button class="iconbtn run" title="Run" (click)="Run(p)"><i class="fa-solid fa-play"></i></button>
                                <button class="iconbtn" title="Edit" (click)="Edit(p)"><i class="fa-solid fa-pen"></i></button>
                            </div>
                        </div>
                    }
                </div>
            }
        } @else {
            <div class="rps-editbar">
                <button mjButton variant="flat" (click)="backToList()"><i class="fa-solid fa-arrow-left"></i> Back</button>
                <h2>{{ EditingID ? 'Edit operation' : 'New operation' }}</h2>
            </div>
            <mj-record-process-editor
                [RecordProcessID]="EditingID"
                [DefaultEntityID]="EntityID"
                [Provider]="Provider"
                (Saved)="onSaved()"
                (Cancelled)="backToList()">
            </mj-record-process-editor>
        }

        @if (RunDriver) {
            <mj-entity-action-ux-host
                [DriverClass]="RunDriver.DriverClass" [Context]="RunDriver.Context"
                (Completed)="onRunDone($event)" (Cancelled)="RunDriver = null">
            </mj-entity-action-ux-host>
        }
    `,
    styles: [`
        :host{display:block;color:var(--mj-text-primary)}
        .rps-bar{display:flex;align-items:center;gap:12px;margin-bottom:16px}
        .rps-search{position:relative;flex:0 0 360px;max-width:360px}
        .rps-search i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mj-text-muted);font-size:13px}
        .rps-search input{padding-left:34px}
        .rps-spacer{flex:1}
        .rps-bar button i,.rps-editbar button i{margin-right:6px}
        .rps-msg,.rps-empty{padding:40px;text-align:center;color:var(--mj-text-muted)}
        .rps-empty i{font-size:30px;display:block;margin-bottom:12px;color:var(--mj-text-disabled)}
        .rps-empty p{margin:0 0 16px}
        .rps-table{border:1px solid var(--mj-border-subtle);border-radius:var(--mj-radius-md,10px);overflow:hidden}
        .rps-tr{display:grid;grid-template-columns:2.2fr 1.2fr 1fr .8fr 1fr;gap:14px;align-items:center;padding:13px 16px;border-bottom:1px solid var(--mj-border-subtle);cursor:pointer;font-size:13.5px}
        .rps-tr:last-child{border-bottom:none}
        .rps-tr:not(.rps-head):hover{background:var(--mj-bg-surface-hover)}
        .rps-head{background:var(--mj-bg-surface-sunken);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mj-text-muted);font-weight:700;cursor:default}
        .rps-nm{font-weight:600}
        .rps-sub{color:var(--mj-text-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
        .ta-r{text-align:right;justify-self:end}
        .rps-acts{display:flex;gap:6px}
        .iconbtn{width:30px;height:30px;border-radius:7px;border:1px solid var(--mj-border-default);background:var(--mj-bg-surface-card);color:var(--mj-text-secondary);cursor:pointer;font-size:12.5px}
        .iconbtn:hover{background:var(--mj-bg-surface-hover);color:var(--mj-text-primary)}
        .iconbtn.run:hover{color:var(--mj-status-success-text);border-color:var(--mj-status-success)}
        .pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--mj-bg-surface-sunken);color:var(--mj-text-secondary)}
        .pill.purple{background:color-mix(in srgb,var(--mj-brand-primary) 14%,transparent);color:var(--mj-brand-primary)}
        .pill.ok{background:var(--mj-status-success-bg);color:var(--mj-status-success-text)}
        .pill.warn{background:var(--mj-status-warning-bg);color:var(--mj-status-warning-text)}
        .pill.muted{background:var(--mj-bg-surface-sunken);color:var(--mj-text-muted)}
        .rps-editbar{display:flex;align-items:center;gap:14px;margin-bottom:18px}
        .rps-editbar h2{margin:0;font-size:18px;font-weight:700}
    `],
})
export class RecordProcessStudioComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** Optional: restrict the hub to processes for one entity (e.g. when embedded on an entity page). */
    @Input() EntityID: string | null = null;

    public Mode: 'list' | 'edit' = 'list';
    public EditingID: string | null = null;
    public Loading = true;
    public Search = '';
    public Processes: ProcessRow[] = [];
    public RunDriver: { DriverClass: string; Context: EntityActionUXContext } | null = null;

    async ngOnInit(): Promise<void> {
        await this.reload();
    }

    get Filtered(): ProcessRow[] {
        const q = this.Search.trim().toLowerCase();
        if (!q) return this.Processes;
        return this.Processes.filter((p) => p.Name.toLowerCase().includes(q) || (p.Entity ?? '').toLowerCase().includes(q));
    }

    async reload(): Promise<void> {
        this.Loading = true; this.cdr.detectChanges();
        const rv = this.Provider ? RunView.FromMetadataProvider(this.Provider) : new RunView();
        const filter = this.EntityID ? `EntityID='${this.EntityID}'` : '';
        const result = await rv.RunView<ProcessRow>({
            EntityName: 'MJ: Record Processes',
            Fields: ['ID', 'Name', 'Description', 'Entity', 'EntityID', 'WorkType', 'Status', 'ScopeType', 'ScopeFilter', 'ScopeViewID', 'ScopeListID'],
            ExtraFilter: filter,
            OrderBy: 'Name',
            ResultType: 'simple',
        });
        this.Processes = result.Success ? (result.Results ?? []) : [];
        this.Loading = false;
        this.cdr.detectChanges();
    }

    onSearch(event: Event): void { this.Search = (event.target as HTMLInputElement).value; this.cdr.detectChanges(); }

    New(): void { this.EditingID = null; this.Mode = 'edit'; this.cdr.detectChanges(); }
    Edit(p: ProcessRow): void { this.EditingID = p.ID; this.Mode = 'edit'; this.cdr.detectChanges(); }
    backToList(): void { this.Mode = 'list'; this.EditingID = null; this.cdr.detectChanges(); }
    async onSaved(): Promise<void> { this.backToList(); await this.reload(); }

    /** Runs a process on demand against its default scope, via the dry-run → confirm runner. */
    Run(p: ProcessRow): void {
        const entity = this.ProviderToUse.EntityByID(p.EntityID);
        if (!entity) return;
        this.RunDriver = {
            DriverClass: 'RecordProcessRunnerUX',
            Context: {
                EntityInfo: entity,
                ScopeKind: (p.ScopeType?.toLowerCase() as EntityActionUXContext['ScopeKind']) || 'filter',
                Filter: p.ScopeFilter ?? undefined,
                ViewID: p.ScopeViewID ?? undefined,
                ListID: p.ScopeListID ?? undefined,
                Config: { RecordProcessID: p.ID },
                Provider: this.ProviderToUse,
                ActionLabel: p.Name,
            },
        };
        this.cdr.detectChanges();
    }

    onRunDone(_r: EntityActionUXResult): void { this.RunDriver = null; this.cdr.detectChanges(); }

    workLabel(workType: string): string {
        return workType === 'FieldRules' ? 'Field Rules' : workType;
    }
}
