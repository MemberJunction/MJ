/**
 * @fileoverview The authoring surface for a single Record Process (a reusable bulk operation). Edits the
 * basics + target entity + scope, and — for the FieldRules work type — embeds the visual
 * `<mj-field-rules-builder>` so a business user defines rules without touching JSON. An inline "Preview"
 * runs the same server dry-run + diff runner used at invocation time.
 *
 * Reused in two places: standalone in the Bulk Operations hub (owns its Save/Preview toolbar), and inside
 * the custom Record Process entity form (toolbar hidden — the form owns Save).
 * @module @memberjunction/ng-record-process-studio
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { type EntityInfo } from '@memberjunction/core';
import { SafeJSONParse, type FieldRuleSet } from '@memberjunction/global';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { FieldRulesBuilderComponent, EntityActionUXHostComponent, type EntityActionUXContext, type EntityActionUXResult } from '@memberjunction/ng-entity-action-ux';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

type ScopeKind = 'Filter' | 'View' | 'List';

@Component({
    selector: 'mj-record-process-editor',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FieldRulesBuilderComponent, EntityActionUXHostComponent, MJButtonDirective],
    template: `
        @if (!Record) {
            <div class="rpe-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>
        } @else {
            <div class="rpe">
                <!-- BASICS -->
                <section class="rpe-sec">
                    <div class="rpe-sec-h"><span class="num">1</span><h3>Basics</h3></div>
                    <div class="rpe-grid2">
                        <div class="field"><label>Name</label>
                            <input class="mj-input" [value]="Record.Name || ''" (input)="set('Name', $event)" placeholder="e.g. Mark idle prompts for review"></div>
                        <div class="field"><label>Status</label>
                            <select class="mj-input" [value]="Record.Status || 'Active'" (change)="set('Status', $event)">
                                <option value="Draft">Draft</option><option value="Active">Active</option><option value="Disabled">Disabled</option>
                            </select></div>
                    </div>
                    <div class="field rpe-mt"><label>Description</label>
                        <input class="mj-input" [value]="Record.Description || ''" (input)="set('Description', $event)" placeholder="What does this process do?"></div>
                </section>

                <!-- TARGET + SCOPE -->
                <section class="rpe-sec">
                    <div class="rpe-sec-h"><span class="num">2</span><h3>What it acts on</h3></div>
                    <div class="rpe-grid3">
                        <div class="field"><label>Entity</label>
                            <select class="mj-input" [value]="Record.EntityID || ''" (change)="onEntityChange($event)">
                                <option value="" disabled>— choose an entity —</option>
                                @for (e of Entities; track e.ID) { <option [value]="e.ID">{{ e.DisplayName || e.Name }}</option> }
                            </select></div>
                        <div class="field"><label>Default scope</label>
                            <select class="mj-input" [value]="Record.ScopeType || 'Filter'" (change)="set('ScopeType', $event)">
                                <option value="Filter">Filter</option><option value="View">A view</option><option value="List">A list</option>
                            </select></div>
                        <div class="field"><label>Work type</label>
                            <select class="mj-input" [value]="Record.WorkType || 'FieldRules'" (change)="set('WorkType', $event)">
                                <option value="FieldRules">Field Rules</option>
                            </select></div>
                    </div>
                    @if (Record.ScopeType === 'Filter') {
                        <div class="field rpe-mt"><label>Filter <span class="muted">— overridden by the grid selection at run time</span></label>
                            <input class="mj-input mono" [value]="Record.ScopeFilter || ''" (input)="set('ScopeFilter', $event)" placeholder="e.g. Status = 'Active'"></div>
                    }
                </section>

                <!-- RULES -->
                @if (Record.WorkType === 'FieldRules') {
                    <section class="rpe-sec">
                        <div class="rpe-sec-h"><span class="num">3</span><h3>Rules</h3>
                            @if (!SelectedEntityName) { <span class="muted rpe-h-note">choose an entity first</span> }
                        </div>
                        @if (SelectedEntityName) {
                            <mj-field-rules-builder
                                [EntityName]="SelectedEntityName"
                                [Value]="RuleSet"
                                [Provider]="Provider"
                                (ValueChange)="onRulesChange($event)"
                                (ValidChange)="RulesValid = $event">
                            </mj-field-rules-builder>
                        }
                    </section>
                }

                <!-- TOOLBAR -->
                @if (ShowToolbar) {
                    <div class="rpe-bar">
                        <button mjButton variant="primary" [disabled]="!CanSave || Saving" (click)="Save()">
                            <i class="fa-solid" [class.fa-floppy-disk]="!Saving" [class.fa-circle-notch]="Saving" [class.fa-spin]="Saving"></i> Save
                        </button>
                        <button mjButton [disabled]="!CanPreview || Saving" (click)="Preview()"><i class="fa-solid fa-flask"></i> Preview changes</button>
                        <button mjButton variant="flat" (click)="Cancel()">Cancel</button>
                        @if (ErrorMessage) { <span class="rpe-err"><i class="fa-solid fa-triangle-exclamation"></i> {{ ErrorMessage }}</span> }
                    </div>
                }
            </div>

            @if (PreviewDriver) {
                <mj-entity-action-ux-host
                    [DriverClass]="PreviewDriver.DriverClass" [Context]="PreviewDriver.Context"
                    (Completed)="onPreviewDone($event)" (Cancelled)="PreviewDriver = null">
                </mj-entity-action-ux-host>
            }
        }
    `,
    styles: [`
        .rpe-loading{padding:30px;color:var(--mj-text-muted);display:flex;align-items:center;gap:10px}
        .rpe{display:flex;flex-direction:column;gap:22px;color:var(--mj-text-primary)}
        .rpe-sec{background:var(--mj-bg-surface-card);border:1px solid var(--mj-border-subtle);border-radius:var(--mj-radius-md,10px);padding:18px 20px}
        .rpe-sec-h{display:flex;align-items:center;gap:11px;margin-bottom:16px}
        .rpe-sec-h h3{margin:0;font-size:16px;font-weight:700}
        .rpe-sec-h .num{width:23px;height:23px;border-radius:50%;background:var(--mj-brand-primary);color:var(--mj-text-inverse);display:grid;place-items:center;font-size:12px;font-weight:800}
        .rpe-h-note{margin-left:6px;font-size:12.5px}
        .rpe-grid2{display:grid;grid-template-columns:1fr 220px;gap:16px}
        .rpe-grid3{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px}
        .field{display:flex;flex-direction:column;gap:6px}
        .field label{font-size:12.5px;font-weight:600;color:var(--mj-text-secondary)}
        .rpe-mt{margin-top:16px}
        .mono{font-family:var(--mj-font-mono,monospace);font-size:12.5px}
        .muted{color:var(--mj-text-muted);font-weight:400}
        .rpe-bar{display:flex;align-items:center;gap:10px;padding-top:4px}
        .rpe-bar button i{margin-right:6px}
        .rpe-err{color:var(--mj-status-error-text);font-size:13px;display:flex;align-items:center;gap:7px}
        .rpe-err i{color:var(--mj-status-error)}
    `],
})
export class RecordProcessEditorComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** The process being edited. Set this OR `RecordProcessID` (or neither, for a new draft). */
    @Input() Record: MJRecordProcessEntity | null = null;
    /** Load an existing process by ID (alternative to passing `Record`). */
    @Input() RecordProcessID: string | null = null;
    /** Default EntityID for a brand-new process (e.g. the grid the user came from). */
    @Input() DefaultEntityID: string | null = null;
    /** Show the built-in Save / Preview / Cancel toolbar. Set false when an outer form owns Save. */
    @Input() ShowToolbar = true;

    /** Emitted after a successful Save (the persisted record). */
    @Output() Saved = new EventEmitter<MJRecordProcessEntity>();
    /** Emitted when the user cancels. */
    @Output() Cancelled = new EventEmitter<void>();

    public Entities: EntityInfo[] = [];
    public SelectedEntityName = '';
    public RuleSet: FieldRuleSet = { Rules: [] };
    public RulesValid = true;
    public Saving = false;
    public ErrorMessage = '';
    public PreviewDriver: { DriverClass: string; Context: EntityActionUXContext } | null = null;

    get CanSave(): boolean { return !!this.Record?.Name && !!this.Record?.EntityID && this.RulesValid; }
    get CanPreview(): boolean { return this.CanSave && this.RuleSet.Rules.length > 0; }

    async ngOnInit(): Promise<void> {
        const provider = this.ProviderToUse;
        this.Entities = [...provider.Entities].sort((a, b) => (a.DisplayName || a.Name).localeCompare(b.DisplayName || b.Name));
        await this.loadRecord();
    }

    /** Resolves the record to edit: passed instance → by ID → a fresh draft. */
    private async loadRecord(): Promise<void> {
        const provider = this.ProviderToUse;
        if (!this.Record) {
            this.Record = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', provider.CurrentUser);
            if (this.RecordProcessID) {
                await this.Record.Load(this.RecordProcessID);
            } else {
                this.Record.NewRecord();
                this.Record.WorkType = 'FieldRules';
                this.Record.ScopeType = 'Filter';
                this.Record.Status = 'Draft';
                if (this.DefaultEntityID) this.Record.EntityID = this.DefaultEntityID;
            }
        }
        this.RuleSet = this.Record.Configuration ? (SafeJSONParse<FieldRuleSet>(this.Record.Configuration) ?? { Rules: [] }) : { Rules: [] };
        this.resolveEntityName();
        this.cdr.detectChanges();
    }

    /** Generic setter for the simple string/enum fields, driven by the template inputs. */
    set(field: 'Name' | 'Description' | 'Status' | 'ScopeType' | 'ScopeFilter' | 'WorkType', event: Event): void {
        if (!this.Record) return;
        const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
        // Strongly-typed assignment per field (no dynamic Set()).
        switch (field) {
            case 'Name': this.Record.Name = value; break;
            case 'Description': this.Record.Description = value; break;
            case 'Status': this.Record.Status = value as MJRecordProcessEntity['Status']; break;
            case 'ScopeType': this.Record.ScopeType = value as MJRecordProcessEntity['ScopeType']; break;
            case 'ScopeFilter': this.Record.ScopeFilter = value; break;
            case 'WorkType': this.Record.WorkType = value as MJRecordProcessEntity['WorkType']; break;
        }
        this.cdr.detectChanges();
    }

    onEntityChange(event: Event): void {
        if (!this.Record) return;
        this.Record.EntityID = (event.target as HTMLSelectElement).value;
        this.resolveEntityName();
        this.cdr.detectChanges();
    }

    onRulesChange(ruleSet: FieldRuleSet): void {
        this.RuleSet = ruleSet;
        if (this.Record) this.Record.Configuration = JSON.stringify(ruleSet);
    }

    /** Saves the record (and emits). Returns success. */
    async Save(): Promise<boolean> {
        if (!this.Record || !this.CanSave) return false;
        this.Saving = true; this.ErrorMessage = ''; this.cdr.detectChanges();
        this.Record.Configuration = JSON.stringify(this.RuleSet);
        const ok = await this.Record.Save();
        this.Saving = false;
        if (ok) {
            this.Saved.emit(this.Record);
        } else {
            this.ErrorMessage = this.Record.LatestResult?.CompleteMessage ?? 'Save failed';
        }
        this.cdr.detectChanges();
        return ok;
    }

    /** Saves (if needed) then mounts the dry-run runner against the process's default scope. */
    async Preview(): Promise<void> {
        if (!this.Record) return;
        if (this.Record.Dirty || !this.Record.IsSaved) {
            const ok = await this.Save();
            if (!ok) return;
        }
        const entity = this.ProviderToUse.EntityByID(this.Record.EntityID);
        if (!entity) { this.ErrorMessage = 'Target entity not found'; this.cdr.detectChanges(); return; }
        this.PreviewDriver = {
            DriverClass: 'RecordProcessRunnerUX',
            Context: {
                EntityInfo: entity,
                ScopeKind: (this.Record.ScopeType?.toLowerCase() as EntityActionUXContext['ScopeKind']) || 'filter',
                Filter: this.Record.ScopeFilter ?? undefined,
                ViewID: this.Record.ScopeViewID ?? undefined,
                ListID: this.Record.ScopeListID ?? undefined,
                Config: { RecordProcessID: this.Record.ID },
                Provider: this.ProviderToUse,
                ActionLabel: `Preview: ${this.Record.Name}`,
            },
        };
        this.cdr.detectChanges();
    }

    onPreviewDone(_result: EntityActionUXResult): void {
        this.PreviewDriver = null;
        this.cdr.detectChanges();
    }

    Cancel(): void { this.Cancelled.emit(); }

    private resolveEntityName(): void {
        this.SelectedEntityName = this.Record?.EntityID ? (this.ProviderToUse.EntityByID(this.Record.EntityID)?.Name ?? '') : '';
    }
}
