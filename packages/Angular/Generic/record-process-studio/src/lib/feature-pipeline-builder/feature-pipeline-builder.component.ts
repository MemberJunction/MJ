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
import { EntityInfo, EntityFieldInfo, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
    MJRecordProcessEntity,
    MJAIPromptEntity,
    MJEntityDocumentEntity,
    KnowledgeHubMetadataEngine,
    MJFeaturePipelineTypeEntity,
} from '@memberjunction/core-entities';
import {
    DataFeatureSpec,
    DataFeatureOutput,
    ValueConstraint,
    OutputTarget,
    ViolationPolicy,
    renderConstraintBlock,
    validateSpec,
    GetFeaturePipelineCapabilities,
    ValidateOutputsAgainstCapabilities,
    FindEscalationTargetRowProblem,
    FindEscalationTargetSpecProblem,
    type FeaturePipelineDriverCapabilities,
    type FeaturePipelineFieldValueLookup,
    type SpecValidationIssue,
    type EntityMetadataStub,
    type MinimalEscalationTargetRow,
} from '@memberjunction/feature-pipelines';
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJButtonDirective, MJConfirmDialogComponent } from '@memberjunction/ng-ui-components';

export type PromptOption = Pick<MJAIPromptEntity, 'ID' | 'Name' | 'Description'>;

export type EntityDocOption = Pick<MJEntityDocumentEntity, 'ID' | 'Name' | 'EntityID'>;

export interface PipelineTypeOption {
    Name: string;
    DisplayName?: string;
    Description?: string | null;
}

export interface EscalationTargetCandidate extends MinimalEscalationTargetRow {
    Description?: string | null;
    Configuration?: string | null;
    ParsedSpec?: DataFeatureSpec;
}

/**
 * The confidence floor typed into the builder, as a number. A blank or non-numeric entry is NaN, so the spec
 * check reports it ("must be a number greater than 0 and less than 1, but is NaN") instead of the builder
 * guessing a value; an out-of-range number is kept as typed, for the same check to report.
 */
export function ParseConfidenceFloor(raw: string): number {
    const text = raw.trim();
    return text.length === 0 ? Number.NaN : Number(text);
}

@Component({
    selector: 'mj-feature-pipeline-builder',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, MJButtonDirective, MJConfirmDialogComponent],
    template: `
        <div class="fpb">
            <!-- PIPELINE TYPE SELECTOR -->
            <section class="rpe-sec fpb-type-sec">
                <div class="rpe-grid2">
                    <div class="field">
                        <label>Pipeline Type</label>
                        <select class="mj-input" (change)="OnPipelineTypeSelect($event)">
                            @for (t of AvailablePipelineTypes; track t.Name) {
                                <option [value]="t.Name" [selected]="IsCurrentPipelineType(t.Name)">{{ t.DisplayName || t.Name }}</option>
                            }
                        </select>
                    </div>
                    <div class="field">
                        <label>Type Description</label>
                        <div class="rpe-static-text">{{ SelectedPipelineTypeDescription || '—' }}</div>
                    </div>
                </div>
                @if (ShowCaptureReasoning) {
                    <div class="rpe-grid2 rpe-mt">
                        <div class="field">
                            <label>Capture Reasoning</label>
                            <select class="mj-input fpb-reasoning-select" [value]="spec.CaptureReasoning ? 'true' : 'false'" (change)="UpdateCaptureReasoning($event)">
                                <option value="true">Yes — Keep the model's rationale with each Feature Value</option>
                                <option value="false">No</option>
                            </select>
                        </div>
                    </div>
                }
            </section>

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
                            <select class="mj-input" (change)="onEntityDocChange($event)">
                                <option value="" disabled [selected]="!SavedEntityDocListed">— Select Entity Document —</option>
                                @for (doc of availableDocs; track doc.ID) {
                                    <option [value]="doc.ID" [selected]="IsSavedEntityDoc(doc)">{{ doc.Name }}</option>
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
                        <select class="mj-input" (change)="onPromptChange($event)">
                            <option value="" disabled [selected]="!SavedPromptListed">— Select AI Prompt —</option>
                            @for (p of availablePrompts; track p.ID) {
                                <option [value]="p.ID" [selected]="IsSavedPrompt(p)">{{ p.Name }}</option>
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
                <p class="rpe-desc">Define the structured outputs produced by the pipeline, their type constraints, and target write-back destinations.</p>

                @if (!spec.Outputs || spec.Outputs.length === 0) {
                    <div class="fpb-empty-outputs">
                        <i class="fa-solid fa-arrow-turn-up"></i>
                        <span>No outputs defined. Click <strong>Add Output</strong> to configure at least one output attribute.</span>
                    </div>
                } @else {
                    <div class="fpb-outputs-list">
                        @for (output of spec.Outputs; track $index; let outputIndex = $index) {
                            <div class="fpb-output-card">
                                <div class="fpb-output-head">
                                    <h4>Output #{{ outputIndex + 1 }}: {{ output.Name || '(unnamed)' }}</h4>
                                    <button mjButton size="sm" variant="flat" (click)="removeOutput(outputIndex)">
                                        <i class="fa-solid fa-trash"></i> Remove
                                    </button>
                                </div>

                                <div class="rpe-grid3">
                                    <div class="field">
                                        <label>Output Name</label>
                                        <input class="mj-input" [value]="output.Name" (input)="updateOutputProp(outputIndex, 'Name', $event)" placeholder="e.g. SentimentScore">
                                    </div>
                                    <div class="field">
                                        <label>JSON Path / Ref</label>
                                        <input class="mj-input mono" [value]="output.Ref" (input)="updateOutputProp(outputIndex, 'Ref', $event)" placeholder="e.g. $.sentiment or $">
                                    </div>
                                    <div class="field">
                                        <label>Target Mode</label>
                                        <select class="mj-input" (change)="updateTargetMode(outputIndex, $event)">
                                            @if (!IsTargetModeOffered(output)) {
                                                <option value="" disabled [selected]="true">— Select Target Mode —</option>
                                            }
                                            @for (m of AvailableTargetModes; track m.Value) {
                                                <option [value]="m.Value" [selected]="m.Value === output.Target.Mode">{{ m.Label }}</option>
                                            }
                                        </select>
                                    </div>
                                </div>

                                <!-- Target details -->
                                <div class="rpe-grid3 rpe-mt">
                                    @if (output.Target.Mode === 'field') {
                                        <div class="field">
                                            <label>Target Field</label>
                                            <select class="mj-input" (change)="updateFieldTarget(outputIndex, $event)">
                                                <option value="" disabled [selected]="!IsEntityFieldListed(output.Target.EntityFieldName)">— Select Column —</option>
                                                @for (f of entityFields; track f.Name) {
                                                    <option [value]="f.Name" [selected]="f.Name === output.Target.EntityFieldName">{{ f.DisplayName || f.Name }} ({{ f.TSType }})</option>
                                                }
                                            </select>
                                        </div>
                                    }

                                    @if (output.Target.Mode === 'child') {
                                        <div class="field">
                                            <label>Child Entity</label>
                                            <select class="mj-input" (change)="updateChildTargetEntity(outputIndex, $event)">
                                                <option value="" disabled [selected]="!IsEntityListed(output.Target.EntityName)">— Select Entity —</option>
                                                @for (e of availableEntities; track e.ID) {
                                                    <option [value]="e.Name" [selected]="e.Name === output.Target.EntityName">{{ e.DisplayName || e.Name }}</option>
                                                }
                                            </select>
                                        </div>
                                    }

                                    <!-- Constraint details -->
                                    <div class="field">
                                        <label>Constraint Type</label>
                                        <select class="mj-input" (change)="updateConstraintType(outputIndex, $event)">
                                            @if (!IsConstraintTypeOffered(output)) {
                                                <option value="none" disabled [selected]="true">— Select Constraint —</option>
                                            }
                                            @for (t of AvailableConstraintTypes; track t.Value) {
                                                <option [value]="t.Value" [selected]="t.Value === SavedConstraintType(output)">{{ t.Label }}</option>
                                            }
                                        </select>
                                    </div>

                                    @if (output.Constraint) {
                                        <div class="field">
                                            <label>Violation Policy</label>
                                            <select class="mj-input" [value]="output.Constraint.OnViolation || 'fail'" (change)="updateViolationPolicy(outputIndex, $event)">
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
                                        <input class="mj-input" [value]="getEnumValuesCsv(output.Constraint)" (input)="updateEnumValues(outputIndex, $event)" placeholder="e.g. Positive, Neutral, Negative">
                                    </div>
                                    @if (IsDecisionPipeline && GetEnumValues(output).length > 0) {
                                        <div class="field rpe-mt">
                                            <label>Value Descriptions <span class="muted">— Decision models require a description for every choice option</span></label>
                                            <div class="fpb-enum-descriptions">
                                                @for (val of GetEnumValues(output); track val) {
                                                    <div class="fpb-enum-desc-row">
                                                        <span class="fpb-enum-val-badge">{{ val }}</span>
                                                        <input
                                                            class="mj-input"
                                                            [value]="GetEnumValueDescription(output, val)"
                                                            (input)="UpdateEnumValueDescription(outputIndex, val, $event)"
                                                            [placeholder]="'Description for ' + val">
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    }
                                }
                                @if (output.Constraint?.Type === 'numeric') {
                                    @if (IsDecisionPipeline) {
                                        <div class="field rpe-mt">
                                            <div class="fpb-levels-header">
                                                <label>Numeric Levels <span class="muted">(Ordered: lowest to highest, 2 to 10 levels)</span></label>
                                                <button
                                                    mjButton
                                                    size="sm"
                                                    variant="secondary"
                                                    type="button"
                                                    [disabled]="GetNumericLevels(output).length >= 10"
                                                    (click)="AddNumericLevel(outputIndex)">
                                                    <i class="fa-solid fa-plus"></i> Add Level
                                                </button>
                                            </div>
                                            <div class="fpb-levels-list">
                                                @for (lvl of GetNumericLevels(output); track $index; let lvlIdx = $index; let first = $first; let last = $last) {
                                                    <div class="fpb-level-row">
                                                        <span class="fpb-level-num">{{ lvlIdx + 1 }}</span>
                                                        <input
                                                            class="mj-input"
                                                            [value]="lvl"
                                                            (input)="UpdateNumericLevel(outputIndex, lvlIdx, $event)"
                                                            placeholder="Level label (e.g. Low, Medium, High)">
                                                        <button
                                                            mjButton
                                                            size="sm"
                                                            variant="flat"
                                                            type="button"
                                                            [disabled]="first"
                                                            (click)="MoveNumericLevel(outputIndex, lvlIdx, 'up')"
                                                            title="Move Up">
                                                            <i class="fa-solid fa-arrow-up"></i>
                                                        </button>
                                                        <button
                                                            mjButton
                                                            size="sm"
                                                            variant="flat"
                                                            type="button"
                                                            [disabled]="last"
                                                            (click)="MoveNumericLevel(outputIndex, lvlIdx, 'down')"
                                                            title="Move Down">
                                                            <i class="fa-solid fa-arrow-down"></i>
                                                        </button>
                                                        <button
                                                            mjButton
                                                            size="sm"
                                                            variant="flat"
                                                            type="button"
                                                            [disabled]="GetNumericLevels(output).length <= 2"
                                                            (click)="RemoveNumericLevel(outputIndex, lvlIdx)"
                                                            title="Remove Level">
                                                            <i class="fa-solid fa-trash"></i>
                                                        </button>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    } @else {
                                        <div class="rpe-grid2 rpe-mt">
                                            <div class="field">
                                                <label>Min Value</label>
                                                <input class="mj-input" type="number" [value]="getNumericMin(output.Constraint)" (input)="updateNumericMin(outputIndex, $event)">
                                            </div>
                                            <div class="field">
                                                <label>Max Value</label>
                                                <input class="mj-input" type="number" [value]="getNumericMax(output.Constraint)" (input)="updateNumericMax(outputIndex, $event)">
                                            </div>
                                        </div>
                                    }
                                }
                                @if (output.Constraint?.Type === 'boolean' && IsDecisionPipeline) {
                                    <div class="field rpe-mt">
                                        <label>Decision Threshold (0.0 to 1.0) <span class="muted">— calibrated probability threshold for true</span></label>
                                        <input
                                            class="mj-input"
                                            type="number"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            placeholder="0.5"
                                            [value]="GetBooleanThreshold(output) ?? ''"
                                            (input)="UpdateBooleanThreshold(outputIndex, $event)">
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            </section>

            <!-- ESCALATION (DECISION PIPELINES ONLY) -->
            @if (IsDecisionPipeline) {
                <section class="rpe-sec fpb-escalation-sec">
                    <div class="rpe-sec-h">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        <h3>Borderline Escalation</h3>
                    </div>
                    <p class="rpe-desc">Records any output of which the decision model answers below this confidence are re-run through the chosen LLM pipeline. Only those records are re-run.</p>

                    <div class="fpb-escalation-toggle-row">
                        <label class="fpb-checkbox-label">
                            <input
                                type="checkbox"
                                [checked]="IsEscalationEnabled"
                                (change)="OnEscalationToggle($event)">
                            <span>Escalate borderline records to an LLM pipeline</span>
                        </label>
                    </div>

                    @if (IsEscalationEnabled) {
                        <div class="rpe-grid2 rpe-mt">
                            <div class="field">
                                <label>Target LLM Pipeline</label>
                                <select
                                    class="mj-input"
                                    [value]="spec.Escalation?.PipelineID || ''"
                                    (change)="OnEscalationTargetChange($event)">
                                    <option value="" disabled>{{ EscalationTargetsPlaceholder }}</option>
                                    @for (target of AvailableEscalationTargets; track target.ID) {
                                        <option [value]="target.ID" [disabled]="!!GetTargetProblem(target)">
                                            {{ target.Name }}{{ GetTargetProblem(target) ? ' (' + GetTargetProblem(target) + ')' : '' }}
                                        </option>
                                    }
                                </select>
                            </div>

                            <div class="field">
                                <label>Confidence Floor (0.0 to 1.0)</label>
                                <input
                                    class="mj-input"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    placeholder="0.7"
                                    [value]="spec.Escalation?.BelowConfidence ?? ''"
                                    (input)="OnEscalationFloorChange($event)">
                            </div>
                        </div>
                    }
                </section>
            }

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

            <!-- TYPE SWITCH CONFIRMATION DIALOG -->
            <mj-confirm-dialog
                [(Visible)]="ShowTypeSwitchConfirm"
                Type="warning"
                Title="Switch Pipeline Type"
                [Message]="'Switching to ' + (PendingPipelineType || 'selected type') + ' will affect existing outputs:'"
                ConfirmText="Switch Anyway"
                CancelText="Cancel"
                (Confirmed)="OnTypeSwitchConfirmed()"
                (Cancelled)="OnTypeSwitchCancelled()">
                <ul class="fpb-confirm-issues">
                    @for (issue of TypeSwitchIssues; track $index) {
                        <li>{{ issue }}</li>
                    }
                </ul>
            </mj-confirm-dialog>
        </div>
    `,
    styles: [`
        .fpb { display: flex; flex-direction: column; gap: 20px; }
        .rpe-desc { font-size: 13px; color: var(--mj-text-secondary); margin: -6px 0 16px 0; }
        .rpe-sec { background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-subtle); border-radius: var(--mj-radius-md, 10px); padding: 18px 20px; }
        .fpb-type-sec { border-left: 3px solid var(--mj-brand-primary); }
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
        .fpb-code-preview { background: var(--mj-bg-surface-sunken, #0f172a); color: var(--mj-text-code, var(--mj-text-primary, #e2e8f0)); border: 1px solid var(--mj-border-subtle, #334155); padding: 12px; border-radius: 6px; font-size: 12px; font-family: var(--mj-font-mono, monospace); white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow-y: auto; margin: 0; }
        .fpb-empty-outputs { display: flex; align-items: center; gap: 10px; padding: 20px; border: 1px dashed var(--mj-border-subtle); border-radius: 8px; color: var(--mj-text-muted); font-size: 13px; }
        .fpb-outputs-list { display: flex; flex-direction: column; gap: 16px; }
        .fpb-output-card { border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 14px 16px; background: var(--mj-bg-surface); }
        .fpb-output-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--mj-border-subtle); padding-bottom: 8px; }
        .fpb-output-head h4 { margin: 0; font-size: 14px; font-weight: 600; }
        .fpb-issues-card { border-radius: 8px; padding: 12px 16px; font-size: 13px; }
        .fpb-issues-card--error { background: rgba(239, 68, 68, 0.08); border: 1px solid var(--mj-status-error); color: var(--mj-status-error-text); }
        .fpb-issues-card h4 { margin: 0 0 8px 0; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .fpb-issues-card ul { margin: 0; padding-left: 20px; }
        .fpb-confirm-issues { margin: 10px 0 0 0; padding-left: 20px; color: var(--mj-status-error-text, var(--mj-text-primary)); font-size: 13px; }
        .fpb-confirm-issues li { margin-bottom: 4px; }
        .fpb-levels-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .fpb-levels-list { display: flex; flex-direction: column; gap: 8px; }
        .fpb-level-row { display: flex; align-items: center; gap: 8px; }
        .fpb-level-num { width: 22px; height: 22px; display: grid; place-items: center; font-size: 11px; font-weight: 700; border-radius: var(--mj-radius-sm, 4px); background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary); flex-shrink: 0; }
        .fpb-enum-descriptions { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
        .fpb-enum-desc-row { display: flex; align-items: center; gap: 10px; }
        .fpb-enum-val-badge { min-width: 90px; padding: 4px 8px; background: var(--mj-bg-surface-sunken); color: var(--mj-text-primary); border: 1px solid var(--mj-border-subtle); border-radius: var(--mj-radius-sm, 4px); font-size: 12px; font-weight: 600; text-align: center; flex-shrink: 0; }
        .fpb-escalation-toggle-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .fpb-checkbox-label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--mj-text-primary); user-select: none; }
        .fpb-checkbox-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--mj-brand-primary); }
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

    public AvailablePipelineTypes: PipelineTypeOption[] = [
        { Name: 'LLM', Description: null },
    ];
    public ShowTypeSwitchConfirm = false;
    public PendingPipelineType: string | null = null;
    public TypeSwitchIssues: string[] = [];

    public get CurrentPipelineTypeName(): string {
        return this.spec.PipelineType?.trim() || 'LLM';
    }

    public get CurrentCapabilities(): FeaturePipelineDriverCapabilities {
        return GetFeaturePipelineCapabilities(this.CurrentPipelineTypeName);
    }

    public get IsDecisionPipeline(): boolean {
        return this.CurrentPipelineTypeName.toLowerCase() === 'decision';
    }

    public AvailableEscalationTargets: EscalationTargetCandidate[] = [];
    /** Whether the escalation targets were loaded. False until a load succeeds, and after one fails. */
    public EscalationTargetsLoaded = false;
    /** Why the last load of escalation targets failed, or null when it did not. */
    public EscalationTargetsLoadError: string | null = null;
    /** Numbers each target load, so a slower earlier load cannot overwrite a later one. */
    private escalationTargetsLoadSeq = 0;

    public get IsEscalationEnabled(): boolean {
        return this.spec.Escalation !== undefined && this.spec.Escalation !== null;
    }

    /** The target picker's empty option: what to pick, or why there is nothing to pick. */
    public get EscalationTargetsPlaceholder(): string {
        if (this.EscalationTargetsLoadError) {
            return '— Pipelines could not be loaded —';
        }
        return this.AvailableEscalationTargets.length > 0 ? '— Select LLM Pipeline —' : '— No other Infer pipelines on this entity —';
    }

    /**
     * Whether to offer the Capture Reasoning setting: for a type that produces reasoning, and for any spec
     * that already asks for it, so a pipeline switched to a type without reasoning can turn it off.
     */
    public get ShowCaptureReasoning(): boolean {
        return this.CurrentCapabilities.ProducesReasoning || this.spec.CaptureReasoning === true;
    }

    public get SelectedPipelineTypeDescription(): string {
        const cur = this.CurrentPipelineTypeName.toLowerCase();
        const opt = this.AvailablePipelineTypes.find((t) => t.Name.toLowerCase() === cur);
        return opt?.Description ?? '';
    }

    public get AvailableTargetModes(): Array<{ Value: OutputTarget['Mode']; Label: string }> {
        const all: Array<{ Value: OutputTarget['Mode']; Label: string }> = [
            { Value: 'field', Label: 'Entity Column (field)' },
            { Value: 'child', Label: 'Child Rows (child)' },
            { Value: 'tags', Label: 'Taxonomy Tags (tags)' },
        ];
        const supported = this.CurrentCapabilities.TargetModes;
        return all.filter((m) => supported.includes(m.Value));
    }

    public get AvailableConstraintTypes(): Array<{ Value: string; Label: string }> {
        const options: Array<{ Value: string; Label: string }> = [];
        if (!this.IsDecisionPipeline) {
            options.push({ Value: 'none', Label: 'None / Unconstrained' });
        }
        if (this.CurrentCapabilities.ConstraintTypes.includes('boolean')) {
            options.push({ Value: 'boolean', Label: 'Boolean' });
        }
        if (this.CurrentCapabilities.ConstraintTypes.includes('enum')) {
            options.push({ Value: 'enum', Label: 'Enum (Allowed Values)' });
        }
        if (this.CurrentCapabilities.ConstraintTypes.includes('numeric')) {
            options.push({ Value: 'numeric', Label: this.IsDecisionPipeline ? 'Numeric (Levels)' : 'Numeric (Min/Max)' });
        }
        if (this.CurrentCapabilities.ConstraintTypes.includes('freetext')) {
            options.push({ Value: 'freetext', Label: 'Free Text' });
        }
        return options;
    }

    // The pickers mark the saved option with [selected] on each <option>, not [value] on the <select>. A [value]
    // binding runs before @for creates the options, matches nothing, and does not run again, so the browser shows
    // the first option. When the saved value is not listed, the placeholder is selected. A placeholder inside @if
    // binds [selected] instead of carrying the attribute, because on a live type switch the attribute loses to the
    // option still selected, which is then removed.

    /** Whether `name` is the spec's pipeline type. Names compare case-insensitively, as {@link IsDecisionPipeline} does. */
    public IsCurrentPipelineType(name: string): boolean {
        return name.toLowerCase() === this.CurrentPipelineTypeName.toLowerCase();
    }

    /** The output's saved constraint type as the constraint picker names it: `'none'` when it has none. */
    public SavedConstraintType(output: DataFeatureOutput): string {
        return output.Constraint?.Type || 'none';
    }

    /** Whether the constraint picker lists the output's saved type. A Decision output with no constraint, or one this type cannot produce, is not listed. */
    public IsConstraintTypeOffered(output: DataFeatureOutput): boolean {
        const saved = this.SavedConstraintType(output);
        return this.AvailableConstraintTypes.some((t) => t.Value === saved);
    }

    /** Whether the target mode picker lists the output's saved mode. */
    public IsTargetModeOffered(output: DataFeatureOutput): boolean {
        return this.AvailableTargetModes.some((m) => m.Value === output.Target.Mode);
    }

    /** Whether the target field picker lists a field named `name`. */
    public IsEntityFieldListed(name: string | undefined): boolean {
        return !!name && this.EntityFields.some((f) => f.Name === name);
    }

    /** Whether the child entity picker lists an entity named `name`. */
    public IsEntityListed(name: string | undefined): boolean {
        return !!name && this.AvailableEntities.some((e) => e.Name === name);
    }

    /** Whether `prompt` is the pipeline's saved prompt. */
    public IsSavedPrompt(prompt: PromptOption): boolean {
        return UUIDsEqual(prompt.ID, this.Record ? this.Record.PromptID : this.spec.PromptID);
    }

    /** Whether the prompt picker lists the pipeline's saved prompt. */
    public get SavedPromptListed(): boolean {
        return this.AvailablePrompts.some((p) => this.IsSavedPrompt(p));
    }

    /** Whether `doc` is the spec's saved entity document. */
    public IsSavedEntityDoc(doc: EntityDocOption): boolean {
        return UUIDsEqual(doc.ID, this.spec.Context.EntityDocumentID);
    }

    /** Whether the entity document picker lists the spec's saved document. */
    public get SavedEntityDocListed(): boolean {
        return this.AvailableDocs.some((d) => this.IsSavedEntityDoc(d));
    }

    public AvailablePrompts: PromptOption[] = [];

    /** @deprecated Use {@link AvailablePrompts}. */
    public get availablePrompts(): PromptOption[] {
        return this.AvailablePrompts;
    }
    /** @deprecated Use {@link AvailablePrompts}. */
    public set availablePrompts(value: PromptOption[]) {
        this.AvailablePrompts = value;
    }
    public AvailableDocs: EntityDocOption[] = [];

    /** @deprecated Use {@link AvailableDocs}. */
    public get availableDocs(): EntityDocOption[] {
        return this.AvailableDocs;
    }
    /** @deprecated Use {@link AvailableDocs}. */
    public set availableDocs(value: EntityDocOption[]) {
        this.AvailableDocs = value;
    }
    public AvailableEntities: EntityInfo[] = [];

    /** @deprecated Use {@link AvailableEntities}. */
    public get availableEntities(): EntityInfo[] {
        return this.AvailableEntities;
    }
    /** @deprecated Use {@link AvailableEntities}. */
    public set availableEntities(value: EntityInfo[]) {
        this.AvailableEntities = value;
    }
    public EntityFields: EntityFieldInfo[] = [];

    /** @deprecated Use {@link EntityFields}. */
    public get entityFields(): EntityFieldInfo[] {
        return this.EntityFields;
    }
    /** @deprecated Use {@link EntityFields}. */
    public set entityFields(value: EntityFieldInfo[]) {
        this.EntityFields = value;
    }
    public SelectedPrompt: PromptOption | null = null;

    /** @deprecated Use {@link SelectedPrompt}. */
    public get selectedPrompt(): PromptOption | null {
        return this.SelectedPrompt;
    }
    /** @deprecated Use {@link SelectedPrompt}. */
    public set selectedPrompt(value: PromptOption | null) {
        this.SelectedPrompt = value;
    }

    public ContextMode: 'fields' | 'document' | 'query' = 'fields';

    /** @deprecated Use {@link ContextMode}. */
    public get contextMode(): 'fields' | 'document' | 'query' {
        return this.ContextMode;
    }
    /** @deprecated Use {@link ContextMode}. */
    public set contextMode(value: 'fields' | 'document' | 'query') {
        this.ContextMode = value;
    }
    public FieldsCsv = '';

    /** @deprecated Use {@link FieldsCsv}. */
    public get fieldsCsv() {
        return this.FieldsCsv;
    }
    /** @deprecated Use {@link FieldsCsv}. */
    public set fieldsCsv(value) {
        this.FieldsCsv = value;
    }
    public CacheKeyFieldsCsv = '';

    /** @deprecated Use {@link CacheKeyFieldsCsv}. */
    public get cacheKeyFieldsCsv() {
        return this.CacheKeyFieldsCsv;
    }
    /** @deprecated Use {@link CacheKeyFieldsCsv}. */
    public set cacheKeyFieldsCsv(value) {
        this.CacheKeyFieldsCsv = value;
    }
    public ValidationErrors: SpecValidationIssue[] = [];

    /** @deprecated Use {@link ValidationErrors}. */
    public get validationErrors(): SpecValidationIssue[] {
        return this.ValidationErrors;
    }
    /** @deprecated Use {@link ValidationErrors}. */
    public set validationErrors(value: SpecValidationIssue[]) {
        this.ValidationErrors = value;
    }
    public RenderedConstraintPreview = '';

    /** @deprecated Use {@link RenderedConstraintPreview}. */
    public get renderedConstraintPreview() {
        return this.RenderedConstraintPreview;
    }
    /** @deprecated Use {@link RenderedConstraintPreview}. */
    public set renderedConstraintPreview(value) {
        this.RenderedConstraintPreview = value;
    }

    async ngOnInit(): Promise<void> {
        this.AvailableEntities = [...this.ProviderToUse.Entities].sort((a, b) =>
            (a.DisplayName || a.Name).localeCompare(b.DisplayName || b.Name)
        );
        await this.loadPipelineTypes();
        await this.loadPrompts();
        await this.loadEntityDocs();
        await this.LoadEscalationTargets();
        this.SyncFromRecord();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Record'] || changes['EntityID']) {
            this.SyncFromRecord();
            // ngOnInit loads the targets for the first binding; reload only when the pipeline or entity changes after it
            const firstBinding = Object.values(changes).every((change) => change.firstChange);
            if (!firstBinding) {
                void this.LoadEscalationTargets();
            }
        }
    }

    public SyncFromRecord(): void {
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
                    this.spec.PipelineType = parsed.PipelineType;
                    if (parsed.Escalation) {
                        this.spec.Escalation = { ...parsed.Escalation };
                    } else {
                        delete this.spec.Escalation;
                    }
                    // Carried so the capability check sees what the runtime sees, and the next edit keeps them
                    this.spec.CaptureReasoning = parsed.CaptureReasoning;
                    this.spec.Watermark = parsed.Watermark;
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
            this.ContextMode = 'document';
        } else if (this.spec.Context.QueryID) {
            this.ContextMode = 'query';
        } else {
            this.ContextMode = 'fields';
        }

        this.FieldsCsv = (this.spec.Context.Fields ?? []).join(', ');
        this.CacheKeyFieldsCsv = (this.spec.Caching.KeyFields ?? []).join(', ');

        const targetEntityID = this.Record?.EntityID || this.EntityID;
        if (targetEntityID) {
            const entity = this.ProviderToUse.EntityByID(targetEntityID);
            this.EntityFields = entity?.Fields ? [...entity.Fields].sort((a, b) => a.Name.localeCompare(b.Name)) : [];
        } else {
            this.EntityFields = [];
        }

        if (this.Record?.PromptID) {
            this.SelectedPrompt = this.AvailablePrompts.find((p) => UUIDsEqual(p.ID, this.Record?.PromptID)) ?? null;
        }

        this.ensureLoadedTypeIncluded();
        this.recomputeValidation();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SyncFromRecord}. */
    public syncFromRecord(): void {
        return this.SyncFromRecord();
    }

    private async loadPipelineTypes(): Promise<void> {
        let activeRows: MJFeaturePipelineTypeEntity[] = [];
        try {
            await KnowledgeHubMetadataEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
            const engineTypes = KnowledgeHubMetadataEngine.Instance.FeaturePipelineTypes;
            if (Array.isArray(engineTypes)) {
                activeRows = engineTypes.filter((t) => t.Status === 'Active');
            }
        } catch (error) {
            LogError('Error loading Feature Pipeline Types from KnowledgeHubMetadataEngine', undefined, error);
        }

        if (activeRows.length > 0) {
            this.AvailablePipelineTypes = activeRows.map((t) => ({
                Name: t.Name,
                Description: t.Description || null,
            }));
            if (!this.AvailablePipelineTypes.some((t) => t.Name.toLowerCase() === 'llm')) {
                this.AvailablePipelineTypes.unshift({
                    Name: 'LLM',
                    Description: null,
                });
            }
        } else {
            this.AvailablePipelineTypes = [
                {
                    Name: 'LLM',
                    Description: null,
                },
            ];
        }
        this.ensureLoadedTypeIncluded();
    }

    private ensureLoadedTypeIncluded(): void {
        const typeName = this.spec.PipelineType?.trim();
        if (!typeName || typeName.toLowerCase() === 'llm') {
            return;
        }
        const exists = this.AvailablePipelineTypes.some((t) => t.Name.toLowerCase() === typeName.toLowerCase());
        if (exists) {
            return;
        }

        let isInactive = false;
        let desc: string | null = null;
        try {
            const engineTypes = KnowledgeHubMetadataEngine.Instance.FeaturePipelineTypes;
            if (Array.isArray(engineTypes)) {
                const match = engineTypes.find((t) => t.Name?.trim().toLowerCase() === typeName.toLowerCase());
                if (match) {
                    isInactive = match.Status !== 'Active';
                    desc = match.Description || null;
                }
            }
        } catch {
            // Ignore
        }

        const label = isInactive ? `${typeName} (inactive)` : `${typeName} (unrecognized)`;
        this.AvailablePipelineTypes.push({
            Name: typeName,
            DisplayName: label,
            Description: desc,
        });
    }

    private async loadPrompts(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<PromptOption>({
                EntityName: 'MJ: AI Prompts',
                Fields: ['ID', 'Name', 'Description'],
                ResultType: 'simple',
            });
            if (res.Success && Array.isArray(res.Results)) {
                this.AvailablePrompts = res.Results;
            } else {
                this.AvailablePrompts = [];
                LogError(`Failed to load AI Prompts: ${res.ErrorMessage || 'unknown error'}`);
            }
        } catch (error) {
            this.AvailablePrompts = [];
            LogError('Error loading AI Prompts', undefined, error);
        }
    }

    private async loadEntityDocs(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<EntityDocOption>({
                EntityName: 'MJ: Entity Documents',
                Fields: ['ID', 'Name', 'EntityID'],
                ResultType: 'simple',
            });
            if (res.Success && Array.isArray(res.Results)) {
                this.AvailableDocs = res.Results;
            } else {
                this.AvailableDocs = [];
                LogError(`Failed to load Entity Documents: ${res.ErrorMessage || 'unknown error'}`);
            }
        } catch (error) {
            this.AvailableDocs = [];
            LogError('Error loading Entity Documents', undefined, error);
        }
    }

    /**
     * Loads the Infer pipelines on this pipeline's entity that it could escalate to. With no entity there is
     * nothing to offer, so nothing is loaded. A failed load is recorded in {@link EscalationTargetsLoadError},
     * not taken to mean there are no targets. Only the latest load's result is kept.
     */
    public async LoadEscalationTargets(): Promise<void> {
        const seq = ++this.escalationTargetsLoadSeq;
        const targetEntityID = this.Record?.EntityID || this.EntityID;
        const outcome = targetEntityID
            ? await this.fetchEscalationTargets(targetEntityID)
            : { Targets: [], Error: null };
        if (seq !== this.escalationTargetsLoadSeq) {
            return; // a later load, for a later Record or entity, has superseded this one
        }
        this.AvailableEscalationTargets = outcome.Targets;
        this.EscalationTargetsLoadError = outcome.Error;
        this.EscalationTargetsLoaded = outcome.Error === null;
        this.recomputeValidation();
        this.cdr.detectChanges();
    }

    /** The Infer pipelines on the entity, other than this one, each with its parsed spec; or why they could not be read. */
    private async fetchEscalationTargets(entityID: string): Promise<{ Targets: EscalationTargetCandidate[]; Error: string | null }> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<EscalationTargetCandidate>({
                EntityName: 'MJ: Record Processes',
                Fields: ['ID', 'Name', 'Description', 'Entity', 'EntityID', 'WorkType', 'Status', 'Configuration'],
                ExtraFilter: `WorkType='Infer' AND EntityID='${EscapeSQLString(entityID)}'`,
                OrderBy: 'Name',
                ResultType: 'simple',
            });
            if (!res.Success) {
                const reason = res.ErrorMessage || 'unknown error';
                LogError(`Failed to load Escalation Targets: ${reason}`);
                return { Targets: [], Error: reason };
            }
            const currentID = this.Record?.ID;
            const targets = (res.Results ?? [])
                .filter((r) => !currentID || !UUIDsEqual(r.ID, currentID))
                .map((r) => ({ ...r, ParsedSpec: this.parseTargetSpec(r.Configuration) }));
            return { Targets: targets, Error: null };
        } catch (error) {
            LogError('Error loading Escalation Targets', undefined, error);
            return { Targets: [], Error: error instanceof Error ? error.message : String(error) };
        }
    }

    /** A target's Configuration as a spec, or undefined when it is empty or not a JSON object. */
    private parseTargetSpec(configuration: string | null | undefined): DataFeatureSpec | undefined {
        const parsed = configuration ? SafeJSONParse<DataFeatureSpec>(configuration) : null;
        return parsed && typeof parsed === 'object' ? parsed : undefined;
    }

    /** @deprecated Use {@link LoadEscalationTargets}. */
    public async loadEscalationTargets(): Promise<void> {
        return this.LoadEscalationTargets();
    }

    /**
     * Why a pipeline cannot be this pipeline's escalation target, or null when it can. Beyond the shared row and
     * output checks, its own spec must pass `ValidateSpec`, as the engine requires before it builds the target.
     */
    public GetTargetProblem(target: EscalationTargetCandidate): string | null {
        const targetEntityID = this.Record?.EntityID || this.EntityID || '';
        const rowProblem = FindEscalationTargetRowProblem(target, targetEntityID);
        if (rowProblem) {
            return rowProblem;
        }
        const specError = target.ParsedSpec ? validateSpec(target.ParsedSpec).find((issue) => issue.Severity === 'error') : undefined;
        if (specError) {
            return `has an invalid spec: ${specError.Message}`;
        }
        return FindEscalationTargetSpecProblem(target.ParsedSpec, this.spec.Outputs ?? []);
    }

    public OnEscalationToggle(event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        if (checked) {
            this.spec.Escalation = {
                PipelineID: this.spec.Escalation?.PipelineID || '',
                BelowConfidence: this.spec.Escalation?.BelowConfidence ?? 0.7,
            };
        } else {
            delete this.spec.Escalation;
        }
        this.emitChanges();
    }

    public OnEscalationTargetChange(event: Event): void {
        const val = (event.target as HTMLSelectElement).value;
        if (!this.spec.Escalation) {
            this.spec.Escalation = {
                PipelineID: val,
                BelowConfidence: 0.7,
            };
        } else {
            this.spec.Escalation.PipelineID = val;
        }
        this.emitChanges();
    }

    /** Sets the confidence floor from its input, as a number; a blank or invalid entry is NaN, which the spec check reports. */
    public OnEscalationFloorChange(event: Event): void {
        const floor = ParseConfidenceFloor((event.target as HTMLInputElement).value);
        this.spec.Escalation = { PipelineID: this.spec.Escalation?.PipelineID ?? '', BelowConfidence: floor };
        this.emitChanges();
    }

    public OnContextModeChange(event: Event): void {
        this.ContextMode = (event.target as HTMLSelectElement).value as 'fields' | 'document' | 'query';
        if (!this.spec.Context) this.spec.Context = {};
        if (this.ContextMode === 'fields') {
            this.spec.Context.EntityDocumentID = undefined;
            this.spec.Context.QueryID = undefined;
        } else if (this.ContextMode === 'document') {
            this.spec.Context.QueryID = undefined;
        } else if (this.ContextMode === 'query') {
            this.spec.Context.EntityDocumentID = undefined;
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link OnContextModeChange}. */
    public onContextModeChange(event: Event): void {
        return this.OnContextModeChange(event);
    }

    public OnEntityDocChange(event: Event): void {
        if (!this.spec.Context) this.spec.Context = {};
        this.spec.Context.EntityDocumentID = (event.target as HTMLSelectElement).value;
        this.emitChanges();
    }

    /** @deprecated Use {@link OnEntityDocChange}. */
    public onEntityDocChange(event: Event): void {
        return this.OnEntityDocChange(event);
    }

    public OnQueryIDChange(event: Event): void {
        if (!this.spec.Context) this.spec.Context = {};
        this.spec.Context.QueryID = (event.target as HTMLInputElement).value;
        this.emitChanges();
    }

    /** @deprecated Use {@link OnQueryIDChange}. */
    public onQueryIDChange(event: Event): void {
        return this.OnQueryIDChange(event);
    }

    public OnFieldsCsvChange(event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        this.FieldsCsv = val;
        if (!this.spec.Context) this.spec.Context = {};
        this.spec.Context.Fields = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        this.emitChanges();
    }

    /** @deprecated Use {@link OnFieldsCsvChange}. */
    public onFieldsCsvChange(event: Event): void {
        return this.OnFieldsCsvChange(event);
    }

    public OnPromptChange(event: Event): void {
        const promptID = (event.target as HTMLSelectElement).value;
        if (this.Record) {
            this.Record.PromptID = promptID;
        }
        this.spec.PromptID = promptID;
        this.SelectedPrompt = this.AvailablePrompts.find((p) => UUIDsEqual(p.ID, promptID)) ?? null;
        this.emitChanges();
    }

    /** @deprecated Use {@link OnPromptChange}. */
    public onPromptChange(event: Event): void {
        return this.OnPromptChange(event);
    }

    public addOutput(): void {
        const newOutput: DataFeatureOutput = {
            Name: `Output_${this.spec.Outputs.length + 1}`,
            Ref: '$',
            Target: {
                Mode: 'field',
                EntityFieldName: this.EntityFields.length > 0 ? this.EntityFields[0].Name : '',
            },
        };
        if (this.IsDecisionPipeline) {
            newOutput.Constraint = {
                Type: 'boolean',
                OnViolation: 'fail',
            };
        }
        this.spec.Outputs.push(newOutput);
        this.emitChanges();
    }

    public RemoveOutput(index: number): void {
        this.spec.Outputs.splice(index, 1);
        this.emitChanges();
    }

    /** @deprecated Use {@link RemoveOutput}. */
    public removeOutput(index: number): void {
        return this.RemoveOutput(index);
    }

    public UpdateOutputProp(index: number, prop: 'Name' | 'Ref', event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        this.spec.Outputs[index][prop] = val;
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateOutputProp}. */
    public updateOutputProp(index: number, prop: 'Name' | 'Ref', event: Event): void {
        return this.UpdateOutputProp(index, prop, event);
    }

    public UpdateTargetMode(index: number, event: Event): void {
        const mode = (event.target as HTMLSelectElement).value as OutputTarget['Mode'];
        const current = this.spec.Outputs[index];
        if (mode === 'field') {
            current.Target = {
                Mode: 'field',
                EntityFieldName: this.EntityFields.length > 0 ? this.EntityFields[0].Name : '',
            };
        } else if (mode === 'child') {
            current.Target = {
                Mode: 'child',
                EntityName: this.AvailableEntities.length > 0 ? this.AvailableEntities[0].Name : '',
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

    /** @deprecated Use {@link UpdateTargetMode}. */
    public updateTargetMode(index: number, event: Event): void {
        return this.UpdateTargetMode(index, event);
    }

    public UpdateFieldTarget(index: number, event: Event): void {
        const fieldName = (event.target as HTMLSelectElement).value;
        const target = this.spec.Outputs[index].Target;
        if (target.Mode === 'field') {
            target.EntityFieldName = fieldName;
            if (this.spec.Outputs[index].Constraint?.Type === 'enum') {
                this.prefillEnumValuesFromField(this.spec.Outputs[index]);
            }
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateFieldTarget}. */
    public updateFieldTarget(index: number, event: Event): void {
        return this.UpdateFieldTarget(index, event);
    }

    public UpdateChildTargetEntity(index: number, event: Event): void {
        const entityName = (event.target as HTMLSelectElement).value;
        const target = this.spec.Outputs[index].Target;
        if (target.Mode === 'child') {
            target.EntityName = entityName;
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateChildTargetEntity}. */
    public updateChildTargetEntity(index: number, event: Event): void {
        return this.UpdateChildTargetEntity(index, event);
    }

    public UpdateConstraintType(index: number, event: Event): void {
        const type = (event.target as HTMLSelectElement).value;
        const output = this.spec.Outputs[index];
        if (type === 'none') {
            output.Constraint = undefined;
        } else if (type === 'enum') {
            output.Constraint = { Type: 'enum', Values: [], OnViolation: 'fail' };
            this.prefillEnumValuesFromField(output);
        } else if (type === 'numeric') {
            if (this.IsDecisionPipeline) {
                output.Constraint = { Type: 'numeric', Levels: ['Low', 'Medium', 'High'], OnViolation: 'fail' };
            } else {
                output.Constraint = { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' };
            }
        } else if (type === 'boolean') {
            output.Constraint = { Type: 'boolean', OnViolation: 'fail' };
        } else if (type === 'freetext') {
            output.Constraint = { Type: 'freetext', MaxLength: 500, OnViolation: 'fail' };
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateConstraintType}. */
    public updateConstraintType(index: number, event: Event): void {
        return this.UpdateConstraintType(index, event);
    }

    public UpdateViolationPolicy(index: number, event: Event): void {
        const policy = (event.target as HTMLSelectElement).value as ViolationPolicy;
        if (this.spec.Outputs[index].Constraint) {
            this.spec.Outputs[index].Constraint.OnViolation = policy;
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateViolationPolicy}. */
    public updateViolationPolicy(index: number, event: Event): void {
        return this.UpdateViolationPolicy(index, event);
    }

    public GetEnumValuesCsv(constraint?: ValueConstraint): string {
        if (!constraint || constraint.Type !== 'enum' || !Array.isArray(constraint.Values)) {
            return '';
        }
        return constraint.Values.join(', ');
    }

    /** @deprecated Use {@link GetEnumValuesCsv}. */
    public getEnumValuesCsv(constraint?: ValueConstraint): string {
        return this.GetEnumValuesCsv(constraint);
    }

    public GetNumericMin(constraint?: ValueConstraint): number | string {
        return constraint && constraint.Type === 'numeric' && constraint.Min !== undefined ? constraint.Min : '';
    }

    /** @deprecated Use {@link GetNumericMin}. */
    public getNumericMin(constraint?: ValueConstraint): number | string {
        return this.GetNumericMin(constraint);
    }

    public GetNumericMax(constraint?: ValueConstraint): number | string {
        return constraint && constraint.Type === 'numeric' && constraint.Max !== undefined ? constraint.Max : '';
    }

    /** @deprecated Use {@link GetNumericMax}. */
    public getNumericMax(constraint?: ValueConstraint): number | string {
        return this.GetNumericMax(constraint);
    }

    public UpdateEnumValues(index: number, event: Event): void {
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

    /** @deprecated Use {@link UpdateEnumValues}. */
    public updateEnumValues(index: number, event: Event): void {
        return this.UpdateEnumValues(index, event);
    }

    public UpdateNumericMin(index: number, event: Event): void {
        const val = parseFloat((event.target as HTMLInputElement).value);
        const output = this.spec.Outputs[index];
        if (output.Constraint && output.Constraint.Type === 'numeric') {
            output.Constraint.Min = isNaN(val) ? undefined : val;
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateNumericMin}. */
    public updateNumericMin(index: number, event: Event): void {
        return this.UpdateNumericMin(index, event);
    }

    public UpdateNumericMax(index: number, event: Event): void {
        const val = parseFloat((event.target as HTMLInputElement).value);
        const output = this.spec.Outputs[index];
        if (output.Constraint && output.Constraint.Type === 'numeric') {
            output.Constraint.Max = isNaN(val) ? undefined : val;
        }
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateNumericMax}. */
    public updateNumericMax(index: number, event: Event): void {
        return this.UpdateNumericMax(index, event);
    }

    public UpdateWatermarkStrategy(event: Event): void {
        if (this.Record) {
            this.Record.WatermarkStrategy = (event.target as HTMLSelectElement).value as MJRecordProcessEntity['WatermarkStrategy'];
        }
    }

    /** @deprecated Use {@link UpdateWatermarkStrategy}. */
    public updateWatermarkStrategy(event: Event): void {
        return this.UpdateWatermarkStrategy(event);
    }

    public UpdateSkipUnchanged(event: Event): void {
        if (this.Record) {
            this.Record.SkipUnchanged = (event.target as HTMLSelectElement).value === 'true';
        }
    }

    /** @deprecated Use {@link UpdateSkipUnchanged}. */
    public updateSkipUnchanged(event: Event): void {
        return this.UpdateSkipUnchanged(event);
    }

    public UpdateCacheable(event: Event): void {
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: false };
        this.spec.Caching.Cacheable = (event.target as HTMLSelectElement).value === 'true';
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateCacheable}. */
    public updateCacheable(event: Event): void {
        return this.UpdateCacheable(event);
    }

    public UpdateCacheKeyFields(event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        this.CacheKeyFieldsCsv = val;
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: true };
        this.spec.Caching.KeyFields = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateCacheKeyFields}. */
    public updateCacheKeyFields(event: Event): void {
        return this.UpdateCacheKeyFields(event);
    }

    public UpdateCacheTTL(event: Event): void {
        const val = parseInt((event.target as HTMLInputElement).value, 10);
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: true };
        this.spec.Caching.TTLSeconds = isNaN(val) ? 86400 : val;
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateCacheTTL}. */
    public updateCacheTTL(event: Event): void {
        return this.UpdateCacheTTL(event);
    }

    public UpdateCacheScope(event: Event): void {
        const val = (event.target as HTMLSelectElement).value as 'pipeline' | 'prompt';
        if (!this.spec.Caching) this.spec.Caching = { Cacheable: true };
        this.spec.Caching.Scope = val;
        this.emitChanges();
    }

    /** @deprecated Use {@link UpdateCacheScope}. */
    public updateCacheScope(event: Event): void {
        return this.UpdateCacheScope(event);
    }

    /** Turns capture of the model's rationale on or off. Off removes the flag, so a spec that never set it keeps its hash. */
    public UpdateCaptureReasoning(event: Event): void {
        if ((event.target as HTMLSelectElement).value === 'true') {
            this.spec.CaptureReasoning = true;
        } else {
            delete this.spec.CaptureReasoning;
        }
        this.emitChanges();
    }

    public OnPipelineTypeSelect(event: Event): void {
        const target = event.target as HTMLSelectElement;
        const newType = target.value;
        const currentType = this.CurrentPipelineTypeName;
        if (newType.toLowerCase() === currentType.toLowerCase()) {
            return;
        }

        const isNewTypeLLM = newType.trim().toLowerCase() === 'llm';
        const candidateSpec: DataFeatureSpec = {
            ...this.spec,
            PipelineType: isNewTypeLLM ? undefined : newType.trim(),
        };
        if (newType.trim().toLowerCase() !== 'decision') {
            delete candidateSpec.Escalation;
        }

        const newCapabilities = GetFeaturePipelineCapabilities(newType);
        const lookup = this.buildFieldValuesLookup();
        const capIssues = ValidateOutputsAgainstCapabilities(candidateSpec, newCapabilities, lookup);

        let specIssues: string[] = [];
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
            specIssues = validateSpec(candidateSpec, stub).filter((i) => i.Severity === 'error').map((i) => i.Message);
        }

        const allIssues = Array.from(new Set([...capIssues, ...specIssues]));

        if (allIssues.length > 0) {
            target.value = currentType;
            this.PendingPipelineType = newType;
            this.TypeSwitchIssues = allIssues;
            this.ShowTypeSwitchConfirm = true;
            this.cdr.detectChanges();
        } else {
            this.ApplyPipelineTypeChange(newType);
        }
    }

    public OnTypeSwitchConfirmed(): void {
        this.ShowTypeSwitchConfirm = false;
        if (this.PendingPipelineType) {
            this.ApplyPipelineTypeChange(this.PendingPipelineType);
            this.PendingPipelineType = null;
        }
        this.TypeSwitchIssues = [];
        this.cdr.detectChanges();
    }

    public OnTypeSwitchCancelled(): void {
        this.ShowTypeSwitchConfirm = false;
        this.PendingPipelineType = null;
        this.TypeSwitchIssues = [];
        this.cdr.detectChanges();
    }

    public ApplyPipelineTypeChange(newType: string): void {
        if (newType.trim().toLowerCase() === 'llm') {
            delete this.spec.PipelineType;
        } else {
            this.spec.PipelineType = newType.trim();
        }
        if (!this.IsDecisionPipeline) {
            delete this.spec.Escalation;
        }
        this.emitChanges();
    }

    public GetNumericLevels(output: DataFeatureOutput): string[] {
        if (!output.Constraint || output.Constraint.Type !== 'numeric' || !Array.isArray(output.Constraint.Levels)) {
            return [];
        }
        return output.Constraint.Levels;
    }

    public AddNumericLevel(index: number): void {
        const output = this.spec.Outputs[index];
        if (output?.Constraint?.Type === 'numeric') {
            if (!Array.isArray(output.Constraint.Levels) || output.Constraint.Levels.length === 0) {
                output.Constraint.Levels = ['Low', 'Medium', 'High'];
                this.emitChanges();
                return;
            }
            if (output.Constraint.Levels.length < 10) {
                output.Constraint.Levels.push(`Level ${output.Constraint.Levels.length + 1}`);
                this.emitChanges();
            }
        }
    }

    public RemoveNumericLevel(outputIndex: number, levelIndex: number): void {
        const output = this.spec.Outputs[outputIndex];
        if (output?.Constraint?.Type === 'numeric' && Array.isArray(output.Constraint.Levels)) {
            if (output.Constraint.Levels.length > 2) {
                output.Constraint.Levels.splice(levelIndex, 1);
                this.emitChanges();
            }
        }
    }

    public UpdateNumericLevel(outputIndex: number, levelIndex: number, event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        const output = this.spec.Outputs[outputIndex];
        if (output?.Constraint?.Type === 'numeric' && Array.isArray(output.Constraint.Levels)) {
            output.Constraint.Levels[levelIndex] = val;
            this.emitChanges();
        }
    }

    public MoveNumericLevel(outputIndex: number, levelIndex: number, direction: 'up' | 'down'): void {
        const output = this.spec.Outputs[outputIndex];
        if (output?.Constraint?.Type === 'numeric' && Array.isArray(output.Constraint.Levels)) {
            const targetIndex = direction === 'up' ? levelIndex - 1 : levelIndex + 1;
            if (targetIndex >= 0 && targetIndex < output.Constraint.Levels.length) {
                const item = output.Constraint.Levels.splice(levelIndex, 1)[0];
                output.Constraint.Levels.splice(targetIndex, 0, item);
                this.emitChanges();
            }
        }
    }

    public GetEnumValues(output: DataFeatureOutput): string[] {
        if (output.Constraint && output.Constraint.Type === 'enum' && Array.isArray(output.Constraint.Values)) {
            return output.Constraint.Values;
        }
        return [];
    }

    public GetEnumValueDescription(output: DataFeatureOutput, val: string): string {
        if (output.Constraint && output.Constraint.Type === 'enum') {
            return output.Constraint.ValueDescriptions?.[val] ?? '';
        }
        return '';
    }

    public UpdateEnumValueDescription(outputIndex: number, val: string, event: Event): void {
        const desc = (event.target as HTMLInputElement).value;
        const output = this.spec.Outputs[outputIndex];
        if (output?.Constraint && output.Constraint.Type === 'enum') {
            if (!output.Constraint.ValueDescriptions) {
                output.Constraint.ValueDescriptions = {};
            }
            output.Constraint.ValueDescriptions[val] = desc;
            this.emitChanges();
        }
    }

    public GetBooleanThreshold(output: DataFeatureOutput): number | null {
        if (output.Constraint && output.Constraint.Type === 'boolean' && output.Constraint.Threshold !== undefined) {
            return output.Constraint.Threshold;
        }
        return null;
    }

    public UpdateBooleanThreshold(outputIndex: number, event: Event): void {
        const raw = (event.target as HTMLInputElement).value.trim();
        const output = this.spec.Outputs[outputIndex];
        if (output?.Constraint && output.Constraint.Type === 'boolean') {
            if (raw === '') {
                delete output.Constraint.Threshold;
            } else {
                const val = parseFloat(raw);
                output.Constraint.Threshold = isNaN(val) ? undefined : val;
            }
            this.emitChanges();
        }
    }

    private prefillEnumValuesFromField(output: DataFeatureOutput): void {
        if (output.Target.Mode !== 'field' || output.Constraint?.Type !== 'enum') {
            return;
        }
        const fieldName = output.Target.EntityFieldName;
        if (!fieldName) {
            return;
        }
        const field = this.EntityFields.find((f) => f.Name === fieldName);
        if (field && Array.isArray(field.EntityFieldValues) && field.EntityFieldValues.length > 0) {
            if (!output.Constraint.Values || output.Constraint.Values.length === 0) {
                output.Constraint.Values = field.EntityFieldValues.map((v) => v.Value);
            }
            if (this.IsDecisionPipeline) {
                if (!output.Constraint.ValueDescriptions) {
                    output.Constraint.ValueDescriptions = {};
                }
                for (const v of field.EntityFieldValues) {
                    if (!output.Constraint.ValueDescriptions[v.Value] && v.Description) {
                        output.Constraint.ValueDescriptions[v.Value] = v.Description;
                    }
                }
            }
        }
    }

    private emitChanges(): void {
        if (this.spec.PipelineType && this.spec.PipelineType.trim().toLowerCase() === 'llm') {
            delete this.spec.PipelineType;
        }
        if (!this.IsDecisionPipeline) {
            delete this.spec.Escalation;
        }
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
        const fields: Record<string, string> = Object.create(null);
        for (const out of this.spec.Outputs) {
            if (out.Target.Mode === 'field' && out.Target.EntityFieldName) {
                fields[out.Target.EntityFieldName] = out.Ref;
            }
        }
        this.Record.OutputMapping = JSON.stringify({ fields });
    }

    private buildFieldValuesLookup(): FeaturePipelineFieldValueLookup {
        return (fieldName: string) => {
            const field = this.EntityFields.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase());
            return field?.EntityFieldValues ? field.EntityFieldValues.map((v) => ({ Value: v.Value, Description: v.Description })) : undefined;
        };
    }

    private recomputeValidation(): void {
        this.RenderedConstraintPreview = renderConstraintBlock(this.spec.Outputs);
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
            this.ValidationErrors = validateSpec(this.spec, stub);
        } else {
            this.ValidationErrors = validateSpec(this.spec);
        }

        const lookup = this.buildFieldValuesLookup();
        const capIssues = ValidateOutputsAgainstCapabilities(this.spec, this.CurrentCapabilities, lookup);
        for (const capIssue of capIssues) {
            this.ValidationErrors.push({
                Path: 'Outputs',
                Severity: 'error',
                Message: capIssue,
                FixRecommendation: 'Adjust output configuration to match the selected pipeline capabilities.',
            });
        }

        if (this.IsDecisionPipeline && this.spec.Escalation && this.spec.Escalation.PipelineID && this.EscalationTargetsLoadError) {
            // The targets are unknown, not absent: say so, and leave the target to be checked at run time
            this.ValidationErrors.push({
                Path: 'Escalation.PipelineID',
                Severity: 'warning',
                Message: `The escalation target could not be checked: the pipelines on this entity could not be loaded (${this.EscalationTargetsLoadError}).`,
                FixRecommendation: 'Reopen the pipeline to retry. The target is still checked when the pipeline runs.',
            });
        } else if (this.IsDecisionPipeline && this.spec.Escalation) {
            const targetID = this.spec.Escalation.PipelineID;
            if (targetID && this.EscalationTargetsLoaded) {
                const match = this.AvailableEscalationTargets.find((t) => UUIDsEqual(t.ID, targetID));
                if (!match) {
                    this.ValidationErrors.push({
                        Path: 'Escalation.PipelineID',
                        Severity: 'error',
                        Message: `Escalation target pipeline '${targetID}' was not found on this entity.`,
                        FixRecommendation: 'Select a valid Active LLM Feature Pipeline on this entity.',
                    });
                } else {
                    const problem = this.GetTargetProblem(match);
                    if (problem) {
                        this.ValidationErrors.push({
                            Path: 'Escalation.PipelineID',
                            Severity: 'error',
                            Message: `Escalation target pipeline '${match.Name}' ${problem}.`,
                            FixRecommendation: 'Select an Active LLM Feature Pipeline that produces every output of this Decision pipeline.',
                        });
                    }
                }
            }
        }

        const hasErrors = this.ValidationErrors.some((i) => i.Severity === 'error');
        this.ValidChange.emit(!hasErrors);
    }
}
