/**
 * @fileoverview Visual authoring component for a Feature Pipeline (Infer Record Process).
 * Configures the DataFeatureSpec (Context, Outputs & Constraints, Caching) and binds
 * prompt, output mapping, and watermark strategy directly on the MJRecordProcessEntity.
 *
 * @module @memberjunction/ng-record-process-studio
 */

import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnInit,
    Output,
    SimpleChanges,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntityInfo, EntityFieldInfo, RunView, UserInfo } from '@memberjunction/core';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import {
    DataFeatureSpec,
    DataFeatureOutput,
    ValueConstraint,
    OutputTarget,
    ViolationPolicy,
    renderConstraintBlock,
    validateSpec,
    type SpecValidationIssue,
    type EntityMetadataStub,
} from '@memberjunction/feature-pipelines';
import { SafeJSONParse } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

export interface PromptOption {
    ID: string;
    Name: string;
    Description?: string;
    TemplateText?: string;
}

export interface EntityDocOption {
    ID: string;
    Name: string;
    EntityID: string;
}

@Component({
    selector: 'mj-feature-pipeline-builder',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    template: `
        <div class="fpb">
            <!-- STAGE 1: CONTEXT SOURCE -->
            <section class="rpe-sec">
                <div class="rpe-sec-h">
                    <span class="num">1</span>
                    <h3>Context Source</h3>
                </div>
                <p class="rpe-desc">Choose how data from each record is extracted and formatted before being sent to the LLM prompt.</p>

                <div class="rpe-grid3">
                    <div class="field">
                        <label>Context Mode</label>
                        <select class="mj-input" [value]="contextMode" (change)="onContextModeChange($event)">
                            <option value="fields">Record Fields</option>
                            <option value="document">Entity Document (Template)</option>
                            <option value="query">Query (Graph Traversal)</option>
                        </select>
                    </div>

                    @if (contextMode === 'document') {
                        <div class="field">
                            <label>Entity Document</label>
                            <select class="mj-input" [value]="spec.Context.EntityDocumentID || ''" (change)="onEntityDocChange($event)">
                                <option value="" disabled>— Select Entity Document —</option>
                                @for (doc of availableDocs; track doc.ID) {
                                    <option [value]="doc.ID">{{ doc.Name }}</option>
                                }
                            </select>
                        </div>
                    }

                    @if (contextMode === 'query') {
                        <div class="field">
                            <label>Query ID</label>
                            <input class="mj-input mono" [value]="spec.Context.QueryID || ''" (input)="onQueryIDChange($event)" placeholder="UUID of approved Query">
                        </div>
                    }

                    <div class="field">
                        <label>Field Filter (optional)</label>
                        <input class="mj-input" [value]="fieldsCsv" (input)="onFieldsCsvChange($event)" placeholder="e.g. FirstName, LastName, Title">
                    </div>
                </div>
            </section>

            <!-- STAGE 2: PROMPT & INJECTED CONSTRAINTS -->
            <section class="rpe-sec">
                <div class="rpe-sec-h">
                    <span class="num">2</span>
                    <h3>AI Prompt</h3>
                </div>
                <div class="rpe-grid2">
                    <div class="field">
                        <label>Prompt</label>
                        <select class="mj-input" [value]="Record?.PromptID || ''" (change)="onPromptChange($event)">
                            <option value="" disabled>— Select AI Prompt —</option>
                            @for (p of availablePrompts; track p.ID) {
                                <option [value]="p.ID">{{ p.Name }}</option>
                            }
                        </select>
                    </div>
                    @if (selectedPrompt) {
                        <div class="field">
                            <label>Prompt Description</label>
                            <div class="rpe-static-text">{{ selectedPrompt.Description || 'No description provided' }}</div>
                        </div>
                    }
                </div>

                @if (renderedConstraintPreview) {
                    <div class="field rpe-mt">
                        <label>Injected Constraint Block <span class="muted">— automatically appended to prompt instructions</span></label>
                        <pre class="fpb-code-preview">{{ renderedConstraintPreview }}</pre>
                    </div>
                }
            </section>

            <!-- STAGE 3: OUTPUTS & CONSTRAINTS -->
            <section class="rpe-sec">
                <div class="rpe-sec-h fpb-split-h">
                    <div class="fpb-title-group">
                        <span class="num">3</span>
                        <h3>Outputs & Constraints</h3>
                    </div>
                    <button mjButton size="sm" variant="secondary" (click)="addOutput()">
                        <i class="fa-solid fa-plus"></i> Add Output
                    </button>
                </div>
                <p class="rpe-desc">Define the structured outputs produced by the LLM, their type constraints, and target write-back destinations.</p>

                @if (!spec.Outputs || spec.Outputs.length === 0) {
                    <div class="fpb-empty-outputs">
                        <i class="fa-solid fa-arrow-turn-up"></i>
                        <span>No outputs defined. Click <strong>Add Output</strong> to configure at least one output attribute.</span>
                    </div>
                } @else {
                    <div class="fpb-outputs-list">
                        @for (output of spec.Outputs; track $index) {
                            <div class="fpb-output-card">
                                <div class="fpb-output-head">
                                    <h4>Output #{{ $index + 1 }}: {{ output.Name || '(unnamed)' }}</h4>
                                    <button mjButton size="sm" variant="flat" (click)="removeOutput($index)">
                                        <i class="fa-solid fa-trash"></i> Remove
                                    </button>
                                </div>

                                <div class="rpe-grid3">
                                    <div class="field">
                                        <label>Output Name</label>
                                        <input class="mj-input" [value]="output.Name" (input)="updateOutputProp($index, 'Name', $event)" placeholder="e.g. SentimentScore">
                                    </div>
                                    <div class="field">
                                        <label>JSON Path / Ref</label>
                                        <input class="mj-input mono" [value]="output.Ref" (input)="updateOutputProp($index, 'Ref', $event)" placeholder="e.g. $.sentiment or $">
                                    </div>
                                    <div class="field">
                                        <label>Target Mode</label>
                                        <select class="mj-input" [value]="output.Target.Mode" (change)="updateTargetMode($index, $event)">
                                            <option value="field">Entity Column (field)</option>
                                            <option value="child">Child Rows (child)</option>
                                            <option value="tags">Taxonomy Tags (tags)</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Target details -->
                                <div class="rpe-grid3 rpe-mt">
                                    @if (output.Target.Mode === 'field') {
                                        <div class="field">
                                            <label>Target Field</label>
                                            <select class="mj-input" [value]="output.Target.EntityFieldName" (change)="updateFieldTarget($index, $event)">
                                                <option value="" disabled>— Select Column —</option>
                                                @for (f of entityFields; track f.Name) {
                                                    <option [value]="f.Name">{{ f.DisplayName || f.Name }} ({{ f.TSType }})</option>
                                                }
                                            </select>
                                        </div>
                                    }

                                    @if (output.Target.Mode === 'child') {
                                        <div class="field">
                                            <label>Child Entity</label>
                                            <select class="mj-input" [value]="output.Target.EntityName" (change)="updateChildTargetEntity($index, $event)">
                                                <option value="" disabled>— Select Entity —</option>
                                                @for (e of availableEntities; track e.ID) {
                                                    <option [value]="e.Name">{{ e.DisplayName || e.Name }}</option>
                                                }
                                            </select>
                                        </div>
                                    }

                                    <!-- Constraint details -->
                                    <div class="field">
                                        <label>Constraint Type</label>
                                        <select class="mj-input" [value]="output.Constraint?.Type || 'none'" (change)="updateConstraintType($index, $event)">
                                            <option value="none">None / Unconstrained</option>
                                            <option value="enum">Enum (Allowed Values)</option>
                                            <option value="numeric">Numeric (Min/Max)</option>
                                            <option value="boolean">Boolean</option>
                                            <option value="freetext">Free Text</option>
                                        </select>
                                    </div>

                                    @if (output.Constraint) {
                                        <div class="field">
                                            <label>Violation Policy</label>
                                            <select class="mj-input" [value]="output.Constraint.OnViolation || 'fail'" (change)="updateViolationPolicy($index, $event)">
                                                <option value="fail">Fail Row</option>
                                                <option value="null">Set Output to Null</option>
                                                <option value="coerce-to-other">Coerce / Fallback</option>
                                            </select>
                                        </div>
                                    }
                                </div>

                                <!-- Constraint params -->
                                @if (output.Constraint?.Type === 'enum') {
                                    <div class="field rpe-mt">
                                        <label>Allowed Values (comma separated)</label>
                                        <input class="mj-input" [value]="getEnumValuesCsv(output.Constraint)" (input)="updateEnumValues($index, $event)" placeholder="e.g. Positive, Neutral, Negative">
                                    </div>
                                }
                                @if (output.Constraint?.Type === 'numeric') {
                                    <div class="rpe-grid2 rpe-mt">
                                        <div class="field">
                                            <label>Min Value</label>
                                            <input class="mj-input" type="number" [value]="getNumericMin(output.Constraint)" (input)="updateNumericMin($index, $event)">
                                        </div>
                                        <div class="field">
                                            <label>Max Value</label>
                                            <input class="mj-input" type="number" [value]="getNumericMax(output.Constraint)" (input)="updateNumericMax($index, $event)">
                                        </div>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            </section>

            <!-- STAGE 4: MATERIALIZATION & WATERMARK -->
            <section class="rpe-sec">
                <div class="rpe-sec-h">
                    <span class="num">4</span>
                    <h3>Caching & Watermarks</h3>
                </div>
                <div class="rpe-grid3">
                    <div class="field">
                        <label>Watermark Strategy</label>
                        <select class="mj-input" [value]="Record?.WatermarkStrategy || 'Checksum'" (change)="updateWatermarkStrategy($event)">
                            <option value="Checksum">Checksum (Content Hash + Prompt Hash)</option>
                            <option value="UpdatedAt">UpdatedAt (Compare modified timestamp)</option>
                            <option value="None">None (Always process all records)</option>
                        </select>
                    </div>

                    <div class="field">
                        <label>Skip Unchanged Records</label>
                        <select class="mj-input" [value]="Record?.SkipUnchanged ? 'true' : 'false'" (change)="updateSkipUnchanged($event)">
                            <option value="true">Yes — Skip unchanged rows</option>
                            <option value="false">No — Recompute every time</option>
                        </select>
                    </div>

                    <div class="field">
                        <label>Enable Result Cache</label>
                        <select class="mj-input" [value]="spec.Caching.Cacheable ? 'true' : 'false'" (change)="updateCacheable($event)">
                            <option value="true">Yes — Cache outputs by distinct key</option>
                            <option value="false">No — Compute per row</option>
                        </select>
                    </div>
                </div>

                @if (spec.Caching.Cacheable) {
                    <div class="rpe-grid3 rpe-mt">
                        <div class="field">
                            <label>Cache Key Fields (comma separated)</label>
                            <input class="mj-input" [value]="cacheKeyFieldsCsv" (input)="updateCacheKeyFields($event)" placeholder="e.g. CurrentJobTitle">
                        </div>
                        <div class="field">
                            <label>Cache TTL (Seconds)</label>
                            <input class="mj-input" type="number" [value]="spec.Caching.TTLSeconds ?? 86400" (input)="updateCacheTTL($event)">
                        </div>
                        <div class="field">
                            <label>Cache Scope</label>
                            <select class="mj-input" [value]="spec.Caching.Scope || 'pipeline'" (change)="updateCacheScope($event)">
                                <option value="pipeline">Pipeline (Isolated to this process)</option>
                                <option value="prompt">Prompt (Shared across processes with same prompt)</option>
                            </select>
                        </div>
                    </div>
                }
            </section>

            <!-- VALIDATION ISSUES -->
            @if (validationErrors.length > 0) {
                <div class="fpb-issues-card fpb-issues-card--error">
                    <h4><i class="fa-solid fa-triangle-exclamation"></i> Specification Issues</h4>
                    <ul>
                        @for (issue of validationErrors; track $index) {
                            <li><strong>{{ issue.Field ? issue.Field + ': ' : '' }}</strong>{{ issue.Message }} @if (issue.FixRecommendation) { <span class="muted">(Fix: {{ issue.FixRecommendation }})</span> }</li>
                        }
                    </ul>
                </div>
            }
        </div>
    `,
    styles: [`
        .fpb { display: flex; flex-direction: column; gap: 20px; }
        .rpe-desc { font-size: 13px; color: var(--mj-text-secondary); margin: -6px 0 16px 0; }
        .rpe-sec { background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-subtle); border-radius: var(--mj-radius-md, 10px); padding: 18px 20px; }
        .rpe-sec-h { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
        .rpe-sec-h h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--mj-text-primary); }
        .rpe-sec-h .num { width: 24px; height: 24px; border-radius: 50%; background: var(--mj-brand-primary); color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 800; }
        .fpb-split-h { justify-content: space-between; }
        .fpb-title-group { display: flex; align-items: center; gap: 11px; }
        .rpe-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .rpe-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field label { font-size: 12.5px; font-weight: 600; color: var(--mj-text-secondary); }
        .rpe-mt { margin-top: 14px; }
        .mono { font-family: monospace; font-size: 12.5px; }
        .muted { color: var(--mj-text-muted); font-weight: 400; }
        .rpe-static-text { font-size: 13px; color: var(--mj-text-muted); padding: 7px 0; }
        .fpb-code-preview { background: var(--mj-bg-surface-sunken, #1e1e1e); color: var(--mj-text-inverse, #dcdcdc); padding: 12px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow-y: auto; margin: 0; }
        .fpb-empty-outputs { display: flex; align-items: center; gap: 10px; padding: 20px; border: 1px dashed var(--mj-border-subtle); border-radius: 8px; color: var(--mj-text-muted); font-size: 13px; }
        .fpb-outputs-list { display: flex; flex-direction: column; gap: 16px; }
        .fpb-output-card { border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 14px 16px; background: var(--mj-bg-surface); }
        .fpb-output-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--mj-border-subtle); padding-bottom: 8px; }
        .fpb-output-head h4 { margin: 0; font-size: 14px; font-weight: 600; }
        .fpb-issues-card { border-radius: 8px; padding: 12px 16px; font-size: 13px; }
        .fpb-issues-card--error { background: rgba(239, 68, 68, 0.08); border: 1px solid var(--mj-status-error); color: var(--mj-status-error-text); }
        .fpb-issues-card h4 { margin: 0 0 8px 0; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .fpb-issues-card ul { margin: 0; padding-left: 20px; }
    `],
})
export class FeaturePipelineBuilderComponent extends BaseAngularComponent implements OnInit, OnChanges {
    private cdr = inject(ChangeDetectorRef);

    @Input() Record: MJRecordProcessEntity | null = null;
    @Input() EntityID: string | null = null;

    @Output() SpecChange = new EventEmitter<DataFeatureSpec>();
    @Output() ValidChange = new EventEmitter<boolean>();

    public spec: DataFeatureSpec = {
        Name: '',
        Description: '',
        PromptID: '',
        Context: {},
        Outputs: [],
        Caching: { Cacheable: false },
    };

    public availablePrompts: PromptOption[] = [];
    public availableDocs: EntityDocOption[] = [];
    public availableEntities: EntityInfo[] = [];
    public entityFields: EntityFieldInfo[] = [];
    public selectedPrompt: PromptOption | null = null;

    public contextMode: 'fields' | 'document' | 'query' = 'fields';
    public fieldsCsv = '';
    public cacheKeyFieldsCsv = '';
    public validationErrors: SpecValidationIssue[] = [];
    public renderedConstraintPreview = '';

    async ngOnInit(): Promise<void> {
        this.availableEntities = [...this.ProviderToUse.Entities].sort((a, b) =>
            (a.DisplayName || a.Name).localeCompare(b.DisplayName || b.Name)
        );
        await this.loadPrompts();
        await this.loadEntityDocs();
        this.syncFromRecord();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Record'] || changes['EntityID']) {
            this.syncFromRecord();
        }
    }

    public syncFromRecord(): void {
        if (this.Record) {
            this.spec.Name = this.Record.Name || '';
            this.spec.Description = this.Record.Description || '';
            this.spec.PromptID = this.Record.PromptID || '';

            if (this.Record.Configuration) {
                const parsed = SafeJSONParse<DataFeatureSpec>(this.Record.Configuration);
                if (parsed && typeof parsed === 'object') {
                    this.spec.Outputs = Array.isArray(parsed.Outputs) ? parsed.Outputs : [];
                    this.spec.Context = parsed.Context ?? {};
                    this.spec.Caching = parsed.Caching ?? { Cacheable: false };
                    this.spec.ProcessorExtensionKey = parsed.ProcessorExtensionKey;
                }
            }
        }

        if (!this.spec.Outputs) {
            this.spec.Outputs = [];
        }
        if (!this.spec.Context) {
            this.spec.Context = {};
        }

        if (this.spec.Context.EntityDocumentID) {
            this.contextMode = 'document';
        } else if (this.spec.Context.QueryID) {
            this.contextMode = 'query';
        } else {
            this.contextMode = 'fields';
        }

        this.fieldsCsv = (this.spec.Context.Fields ?? []).join(', ');
        this.cacheKeyFieldsCsv = (this.spec.Caching.KeyFields ?? []).join(', ');

        const targetEntityID = this.Record?.EntityID || this.EntityID;
        if (targetEntityID) {
            const entity = this.ProviderToUse.EntityByID(targetEntityID);
            this.entityFields = entity?.Fields ? [...entity.Fields].sort((a, b) => a.Name.localeCompare(b.Name)) : [];
        } else {
            this.entityFields = [];
        }

        if (this.Record?.PromptID) {
            this.selectedPrompt = this.availablePrompts.find((p) => p.ID === this.Record?.PromptID) ?? null;
        }

        this.recomputeValidation();
        this.cdr.detectChanges();
    }

    private async loadPrompts(): Promise<void> {
        try {
            const rv = new RunView();
            const res = await rv.RunView({
                EntityName: 'MJ: AI Prompts',
                ResultType: 'simple',
            }, this.ProviderToUse.CurrentUser);
            if (res.Success && Array.isArray(res.Results)) {
                this.availablePrompts = res.Results.map((r: Record<string, unknown>) => ({
                    ID: String(r.ID),
                    Name: String(r.Name),
                    Description: r.Description ? String(r.Description) : undefined,
                    TemplateText: r.TemplateText ? String(r.TemplateText) : undefined,
                }));
            }
        } catch {
            this.availablePrompts = [];
        }
    }

    private async loadEntityDocs(): Promise<void> {
        try {
            const rv = new RunView();
            const res = await rv.RunView({
                EntityName: 'MJ: Entity Documents',
                ResultType: 'simple',
            }, this.ProviderToUse.CurrentUser);
            if (res.Success && Array.isArray(res.Results)) {
                this.availableDocs = res.Results.map((r: Record<string, unknown>) => ({
                    ID: String(r.ID),
                    Name: String(r.Name),
                    EntityID: String(r.EntityID),
                }));
            }
        } catch {
            this.availableDocs = [];
        }
    }

    public onContextModeChange(event: Event): void {
        this.contextMode = (event.target as HTMLSelectElement).value as 'fields' | 'document' | 'query';
        if (!this.spec.Context) this.spec.Context = {};
        if (this.contextMode === 'fields') {
            this.spec.Context.EntityDocumentID = undefined;
            this.spec.Context.QueryID = undefined;
        } else if (this.contextMode === 'document') {
            this.spec.Context.QueryID = undefined;
        } else if (this.contextMode === 'query') {
            this.spec.Context.EntityDocumentID = undefined;
        }
        this.emitChanges();
    }

    public onEntityDocChange(event: Event): void {
        if (!this.spec.Context) this.spec.Context = {};
        this.spec.Context.EntityDocumentID = (event.target as HTMLSelectElement).value;
        this.emitChanges();
    }

    public onQueryIDChange(event: Event): void {
        if (!this.spec.Context) this.spec.Context = {};
        this.spec.Context.QueryID = (event.target as HTMLInputElement).value;
        this.emitChanges();
    }

    public onFieldsCsvChange(event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        this.fieldsCsv = val;
        if (!this.spec.Context) this.spec.Context = {};
        this.spec.Context.Fields = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        this.emitChanges();
    }

    public onPromptChange(event: Event): void {
        const promptID = (event.target as HTMLSelectElement).value;
        if (this.Record) {
            this.Record.PromptID = promptID;
        }
        this.spec.PromptID = promptID;
        this.selectedPrompt = this.availablePrompts.find((p) => p.ID === promptID) ?? null;
        this.emitChanges();
    }

    public addOutput(): void {
        const newOutput: DataFeatureOutput = {
            Name: `Output_${this.spec.Outputs.length + 1}`,
            Ref: '$',
            Target: {
                Mode: 'field',
                EntityFieldName: this.entityFields.length > 0 ? this.entityFields[0].Name : '',
            },
        };
        this.spec.Outputs.push(newOutput);
        this.emitChanges();
    }

    public removeOutput(index: number): void {
        this.spec.Outputs.splice(index, 1);
        this.emitChanges();
    }

    public updateOutputProp(index: number, prop: 'Name' | 'Ref', event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        this.spec.Outputs[index][prop] = val;
        this.emitChanges();
    }

    public updateTargetMode(index: number, event: Event): void {
        const mode = (event.target as HTMLSelectElement).value as OutputTarget['Mode'];
        const current = this.spec.Outputs[index];
        if (mode === 'field') {
            current.Target = {
                Mode: 'field',
                EntityFieldName: this.entityFields.length > 0 ? this.entityFields[0].Name : '',
            };
        } else if (mode === 'child') {
            current.Target = {
                Mode: 'child',
                EntityName: this.availableEntities.length > 0 ? this.availableEntities[0].Name : '',
                ParentField: 'ParentID',
                Map: {},
            };
        } else if (mode === 'tags') {
            current.Target = {
                Mode: 'tags',
                RootTagID: '',
            };
        }
        this.emitChanges();
    }

    public updateFieldTarget(index: number, event: Event): void {
        const fieldName = (event.target as HTMLSelectElement).value;
        const target = this.spec.Outputs[index].Target;
        if (target.Mode === 'field') {
            target.EntityFieldName = fieldName;
        }
        this.emitChanges();
    }

    public updateChildTargetEntity(index: number, event: Event): void {
        const entityName = (event.target as HTMLSelectElement).value;
        const target = this.spec.Outputs[index].Target;
        if (target.Mode === 'child') {
            target.EntityName = entityName;
        }
        this.emitChanges();
    }

    public updateConstraintType(index: number, event: Event): void {
        const type = (event.target as HTMLSelectElement).value;
        const output = this.spec.Outputs[index];
        if (type === 'none') {
            output.Constraint = undefined;
        } else if (type === 'enum') {
            output.Constraint = { Type: 'enum', Values: [], OnViolation: 'fail' };
        } else if (type === 'numeric') {
            output.Constraint = { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' };
        } else if (type === 'boolean') {
            output.Constraint = { Type: 'boolean', OnViolation: 'fail' };
        } else if (type === 'freetext') {
            output.Constraint = { Type: 'freetext', MaxLength: 500, OnViolation: 'fail' };
        }
        this.emitChanges();
    }

    public updateViolationPolicy(index: number, event: Event): void {
        const policy = (event.target as HTMLSelectElement).value as ViolationPolicy;
        if (this.spec.Outputs[index].Constraint) {
            this.spec.Outputs[index].Constraint.OnViolation = policy;
        }
        this.emitChanges();
    }

    public getEnumValuesCsv(constraint?: ValueConstraint): string {
        if (!constraint || constraint.Type !== 'enum' || !Array.isArray(constraint.Values)) {
            return '';
        }
        return constraint.Values.join(', ');
    }

    public getNumericMin(constraint?: ValueConstraint): number | string {
        return constraint && constraint.Type === 'numeric' && constraint.Min !== undefined ? constraint.Min : '';
    }

    public getNumericMax(constraint?: ValueConstraint): number | string {
        return constraint && constraint.Type === 'numeric' && constraint.Max !== undefined ? constraint.Max : '';
    }

    public updateEnumValues(index: number, event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        const output = this.spec.Outputs[index];
        if (!output.Constraint || output.Constraint.Type !== 'enum') {
            output.Constraint = { Type: 'enum', Values: [], OnViolation: 'fail' };
        }
        output.Constraint.Values = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        this.emitChanges();
    }

    public updateNumericMin(index: number, event: Event): void {
        const val = parseFloat((event.target as HTMLInputElement).value);
        const output = this.spec.Outputs[index];
        if (output.Constraint && output.Constraint.Type === 'numeric') {
            output.Constraint.Min = isNaN(val) ? undefined : val;
        }
        this.emitChanges();
    }

    public updateNumericMax(index: number, event: Event): void {
        const val = parseFloat((event.target as HTMLInputElement).value);
        const output = this.spec.Outputs[index];
        if (output.Constraint && output.Constraint.Type === 'numeric') {
            output.Constraint.Max = isNaN(val) ? undefined : val;
        }
        this.emitChanges();
    }

    public updateWatermarkStrategy(event: Event): void {
        if (this.Record) {
            this.Record.WatermarkStrategy = (event.target as HTMLSelectElement).value as MJRecordProcessEntity['WatermarkStrategy'];
        }
    }

    public updateSkipUnchanged(event: Event): void {
        if (this.Record) {
            this.Record.SkipUnchanged = (event.target as HTMLSelectElement).value === 'true';
        }
    }

    public updateCacheable(event: Event): void {
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: false };
        this.spec.Caching.Cacheable = (event.target as HTMLSelectElement).value === 'true';
        this.emitChanges();
    }

    public updateCacheKeyFields(event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        this.cacheKeyFieldsCsv = val;
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: true };
        this.spec.Caching.KeyFields = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        this.emitChanges();
    }

    public updateCacheTTL(event: Event): void {
        const val = parseInt((event.target as HTMLInputElement).value, 10);
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: true };
        this.spec.Caching.TTLSeconds = isNaN(val) ? 86400 : val;
        this.emitChanges();
    }

    public updateCacheScope(event: Event): void {
        const val = (event.target as HTMLSelectElement).value as 'pipeline' | 'prompt';
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: true };
        this.spec.Caching.Scope = val;
        this.emitChanges();
    }

    private emitChanges(): void {
        if (this.Record) {
            this.spec.Name = this.Record.Name || '';
            this.spec.Description = this.Record.Description || '';
            this.spec.PromptID = this.Record.PromptID || '';
            this.Record.Configuration = JSON.stringify(this.spec);
            this.syncOutputMappingToRecord();
        }
        this.recomputeValidation();
        this.SpecChange.emit(this.spec);
        this.cdr.detectChanges();
    }

    /**
     * Automatically projects spec.Outputs into the record's OutputMapping JSON
     * so that WriteBackProcessor works out of the box without duplicate manual config.
     */
    private syncOutputMappingToRecord(): void {
        if (!this.Record) return;
        const fields: Record<string, string> = {};
        for (const out of this.spec.Outputs) {
            if (out.Target.Mode === 'field' && out.Target.EntityFieldName) {
                fields[out.Target.EntityFieldName] = out.Ref;
            }
        }
        if (Object.keys(fields).length > 0) {
            this.Record.OutputMapping = JSON.stringify({ fields });
        }
    }

    private recomputeValidation(): void {
        this.renderedConstraintPreview = renderConstraintBlock(this.spec.Outputs);
        const entity = this.Record?.EntityID ? this.ProviderToUse.EntityByID(this.Record.EntityID) : null;
        if (entity) {
            const stub: EntityMetadataStub = {
                Name: entity.Name,
                Fields: (entity.Fields ?? []).map((f) => ({
                    Name: f.Name,
                    TSType: f.TSType,
                    IsVirtual: f.IsVirtual,
                    AllowsNull: f.AllowsNull,
                    RelatedEntity: f.RelatedEntity,
                    RelatedEntityID: f.RelatedEntityID,
                    EntityFieldValues: f.EntityFieldValues ? f.EntityFieldValues.map((v) => ({ Value: v.Value, Code: v.Code })) : undefined,
                })),
            };
            this.validationErrors = validateSpec(this.spec, stub);
        } else {
            this.validationErrors = this.spec.Outputs.length === 0
                ? [{
                    Path: 'Outputs',
                    Severity: 'error',
                    Message: 'At least one output attribute must be configured',
                    FixRecommendation: 'Click Add Output to configure an output attribute',
                }]
                : [];
        }
        const hasErrors = this.validationErrors.some((i) => i.Severity === 'error');
        this.ValidChange.emit(!hasErrors);
    }
}
