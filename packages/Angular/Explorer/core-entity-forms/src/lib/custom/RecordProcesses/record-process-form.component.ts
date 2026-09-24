import { Component, OnInit } from '@angular/core';
import { RegisterClass, RegisterClassEx, SafeJSONParse, LogError, EscapeSQLString } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPolicy, FormChromeContext, FormChromeSpec, DETAILS_SECTION_KEY } from '@memberjunction/ng-base-forms';
import { MJRecordProcessFormComponent } from '../../generated/Entities/MJRecordProcess/mjrecordprocess.form.component';
import { EntityInfo, RunView } from '@memberjunction/core';
import type { DataFeatureSpec, SpecValidationIssue, EntityMetadataStub } from '@memberjunction/feature-pipelines';
import { validateSpec } from '@memberjunction/feature-pipelines';

/**
 * View-model representing an individual feature output in the pipeline schema table.
 */
export interface FeatureOutputViewModel {
    Name: string;
    Ref: string;
    FeatureKind: string;
    TargetField: string;
    TargetFieldExists: boolean;
    TargetFieldType: string;
    ConstraintSummary: string;
    ViolationPolicy: string;
    ReasoningTarget: string;
}

/**
 * View-model representing a parameter resolution mapping for the AI prompt.
 */
export interface PromptParamViewModel {
    Param: string;
    Field: string;
}

/**
 * Pure helper function to format raw JSON.
 */
export function FormatRawPipelineJson(configuration?: string | null): string {
    if (!configuration) return '';
    const parsed = SafeJSONParse<DataFeatureSpec>(configuration);
    return parsed ? JSON.stringify(parsed, null, 2) : configuration;
}

/** @deprecated Use {@link FormatRawPipelineJson}. */
export function formatRawPipelineJson(configuration?: string | null): string {
    return FormatRawPipelineJson(configuration);
}

/**
 * Pure helper function to parse DataFeatureSpec safely.
 */
export function ParsePipelineSpec(configuration?: string | null): DataFeatureSpec | null {
    if (!configuration) return null;
    return SafeJSONParse<DataFeatureSpec>(configuration);
}

/** @deprecated Use {@link ParsePipelineSpec}. */
export function parsePipelineSpec(configuration?: string | null): DataFeatureSpec | null {
    return ParsePipelineSpec(configuration);
}

/**
 * Pure helper function to validate pipeline spec against entity stub.
 */
export function ValidatePipelineSpec(
    spec: DataFeatureSpec | null,
    entityStub?: EntityMetadataStub
): SpecValidationIssue[] {
    if (!spec) return [];
    return validateSpec(spec, entityStub);
}

/** @deprecated Use {@link ValidatePipelineSpec}. */
export function validatePipelineSpec(
    spec: DataFeatureSpec | null,
    entityStub?: EntityMetadataStub
): SpecValidationIssue[] {
    return ValidatePipelineSpec(spec, entityStub);
}

/**
 * Pure helper to build feature output view-models from spec or output mapping.
 */
export function BuildFeatureOutputViewModels(
    spec: DataFeatureSpec | null,
    entityInfo?: EntityInfo | null,
    outputMapping?: string | null
): FeatureOutputViewModel[] {
    const outputs: FeatureOutputViewModel[] = [];

    if (spec?.Outputs && spec.Outputs.length > 0) {
        for (const out of spec.Outputs) {
            let targetFieldName = '';
            const targetMode = out.Target?.Mode;
            if (out.Target?.Mode === 'field') {
                targetFieldName = out.Target.EntityFieldName;
            } else if (out.Target?.Mode === 'child') {
                targetFieldName = `Child: ${out.Target.EntityName}`;
            } else if (out.Target?.Mode === 'tags') {
                targetFieldName = `Tags (${out.Target.Growth || 'taxonomy'})`;
            }

            let constraintText = 'None';
            let violationPolicy = 'error';
            const c = out.Constraint;
            if (c) {
                if (c.OnViolation) {
                    violationPolicy = c.OnViolation;
                }
                switch (c.Type) {
                    case 'numeric':
                    case 'money': {
                        const min = c.Min != null ? String(c.Min) : '-∞';
                        const max = c.Max != null ? String(c.Max) : '+∞';
                        constraintText = `[${min}, ${max}]`;
                        break;
                    }
                    case 'enum': {
                        if (c.Values && c.Values.length > 0) {
                            constraintText = `Allowed: ${c.Values.slice(0, 3).join(', ')}${c.Values.length > 3 ? '...' : ''}`;
                        } else if (c.FromFieldMetadata) {
                            constraintText = 'From Field Metadata';
                        }
                        break;
                    }
                    case 'lookup': {
                        constraintText = `Lookup: ${c.Entity || ''}.${c.MatchField || ''}`;
                        break;
                    }
                    case 'date': {
                        constraintText = `Date: [${c.Min || '-∞'}, ${c.Max || '+∞'}]`;
                        break;
                    }
                    case 'boolean': {
                        constraintText = 'Boolean';
                        break;
                    }
                    case 'freetext': {
                        constraintText = c.MaxLength != null ? `Max: ${c.MaxLength} chars` : 'Freetext';
                        break;
                    }
                }
            }

            const isFieldMode = targetMode === 'field';
            const field = isFieldMode && targetFieldName && entityInfo?.Fields
                ? entityInfo.Fields.find((f) => f.Name.toLowerCase() === targetFieldName.toLowerCase())
                : undefined;

            outputs.push({
                Name: out.Name || out.Ref || 'Unnamed',
                Ref: out.Ref || '',
                FeatureKind: out.FeatureKind || (c?.Type === 'numeric' ? 'numeric' : 'categorical'),
                TargetField: targetFieldName || '—',
                TargetFieldExists: isFieldMode ? !!field : true,
                TargetFieldType: isFieldMode ? (field?.TSType || field?.Type || 'unbound') : (targetMode || 'custom'),
                ConstraintSummary: constraintText,
                ViolationPolicy: violationPolicy,
                ReasoningTarget: spec.CaptureReasoning ? 'Enabled' : 'None',
            });
        }
    } else if (outputMapping) {
        const mapping = SafeJSONParse<{ fields?: Record<string, string> } | Record<string, string>>(outputMapping);
        const fieldsObj = (mapping && 'fields' in mapping && mapping.fields) ? mapping.fields : (mapping as Record<string, string> | null);
        if (fieldsObj && typeof fieldsObj === 'object') {
            for (const [key, val] of Object.entries(fieldsObj)) {
                const field = entityInfo?.Fields?.find((f) => f.Name.toLowerCase() === key.toLowerCase());
                outputs.push({
                    Name: String(val),
                    Ref: String(val),
                    FeatureKind: 'field',
                    TargetField: key,
                    TargetFieldExists: !!field,
                    TargetFieldType: field?.TSType || field?.Type || 'unbound',
                    ConstraintSummary: 'Standard',
                    ViolationPolicy: 'null',
                    ReasoningTarget: 'None',
                });
            }
        }
    }

    return outputs;
}

/** @deprecated Use {@link BuildFeatureOutputViewModels}. */
export function buildFeatureOutputViewModels(
    spec: DataFeatureSpec | null,
    entityInfo?: EntityInfo | null,
    outputMapping?: string | null
): FeatureOutputViewModel[] {
    return BuildFeatureOutputViewModels(spec, entityInfo, outputMapping);
}

/**
 * Pure helper to build prompt parameter resolution mappings.
 */
export function BuildPromptParamViewModels(
    spec: DataFeatureSpec | null,
    inputMapping?: string | null
): PromptParamViewModel[] {
    const mappings: PromptParamViewModel[] = [];
    if (spec?.Context?.QueryParams) {
        for (const [param, field] of Object.entries(spec.Context.QueryParams)) {
            mappings.push({ Param: `@${param}`, Field: String(field) });
        }
    } else if (spec?.Context?.InputMapping) {
        for (const [param, field] of Object.entries(spec.Context.InputMapping)) {
            mappings.push({ Param: `@${param}`, Field: String(field) });
        }
    } else if (inputMapping) {
        const raw = SafeJSONParse<Record<string, string>>(inputMapping);
        if (raw) {
            for (const [param, field] of Object.entries(raw)) {
                mappings.push({ Param: `@${param}`, Field: String(field) });
            }
        }
    }
    return mappings;
}

/** @deprecated Use {@link BuildPromptParamViewModels}. */
export function buildPromptParamViewModels(
    spec: DataFeatureSpec | null,
    inputMapping?: string | null
): PromptParamViewModel[] {
    return BuildPromptParamViewModels(spec, inputMapping);
}

/**
 * Custom form override for `MJ: Record Processes` (priority 100).
 * Presents the Record Process / Feature Pipeline in a first-class MJ form with:
 * - Lead panel: "Overview & Status" with hero KPI summary, target entity badge, and trigger diagnostics.
 * - Builder panel: "Pipeline Configuration" embedding the visual <mj-feature-pipeline-builder> for Infer / Feature Pipelines,
 *   or the <mj-record-process-editor> for Field Rules.
 * - History panel: "Prior Runs" embedding <mj-record-process-history> with run status, metrics, and per-record diff drill-down.
 * - Details panel (Option A Structured Cards): First-class semantic cards for Infer pipelines, replacing raw JSON
 *   with configuration health diagnostics, prompt context binding, feature output schema & column validation,
 *   scope preview, and a collapsible raw JSON drawer.
 * - Related entity sections: Watermarks, ML Model Scoring Bindings, Feature Values, Feature Value Caches.
 * - System Metadata panel.
 */
@RegisterClass(BaseFormComponent, 'MJ: Record Processes', 100)
@Component({
    standalone: false,
    selector: 'mj-record-process-form-extended',
    templateUrl: './record-process-form.component.html',
    styleUrls: ['./record-process-form.component.css'],
})
export class RecordProcessFormComponentExtended extends MJRecordProcessFormComponent implements OnInit {
    public PipelineValid = true;

    /** @deprecated Use {@link PipelineValid}. */
    public get pipelineValid() {
        return this.PipelineValid;
    }
    /** @deprecated Use {@link PipelineValid}. */
    public set pipelineValid(value) {
        this.PipelineValid = value;
    }
    public RawJsonExpanded = false;

    /** @deprecated Use {@link RawJsonExpanded}. */
    public get rawJsonExpanded() {
        return this.RawJsonExpanded;
    }
    /** @deprecated Use {@link RawJsonExpanded}. */
    public set rawJsonExpanded(value) {
        this.RawJsonExpanded = value;
    }
    public RawJsonCopied = false;

    /** @deprecated Use {@link RawJsonCopied}. */
    public get rawJsonCopied() {
        return this.RawJsonCopied;
    }
    /** @deprecated Use {@link RawJsonCopied}. */
    public set rawJsonCopied(value) {
        this.RawJsonCopied = value;
    }
    public LoadedQuery: { ID: string; Name: string; SQL: string } | null = null;

    /** @deprecated Use {@link LoadedQuery}. */
    public get loadedQuery(): { ID: string; Name: string; SQL: string } | null {
        return this.LoadedQuery;
    }
    /** @deprecated Use {@link LoadedQuery}. */
    public set loadedQuery(value: { ID: string; Name: string; SQL: string } | null) {
        this.LoadedQuery = value;
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'processOverview', sectionName: 'Overview & Status', isExpanded: true },
            { sectionKey: 'inferConfig', sectionName: 'Infer Configuration', isExpanded: true },
            { sectionKey: 'pipelineConfiguration', sectionName: 'Pipeline Configuration', isExpanded: true },
            { sectionKey: 'processRuns', sectionName: 'Prior Runs', isExpanded: true },
            { sectionKey: 'processDefinition', sectionName: 'Process Definition', isExpanded: true },
            { sectionKey: 'executionLogic', sectionName: 'Execution Logic', isExpanded: false },
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: true },
            { sectionKey: 'triggers', sectionName: 'Triggers', isExpanded: true },
            { sectionKey: 'performanceAndOptimization', sectionName: 'Performance & Optimization', isExpanded: false },
            { sectionKey: 'mJRecordProcessWatermarks', sectionName: 'Record Process Watermarks', isExpanded: false },
            { sectionKey: 'mJMLModelScoringBindings', sectionName: 'ML Model Scoring Bindings', isExpanded: false },
            { sectionKey: 'mJFeatureValues', sectionName: 'Feature Values', isExpanded: false },
            { sectionKey: 'mJFeatureValueCaches', sectionName: 'Feature Value Caches', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);
        await this.loadContextQuery();
    }

    private async loadContextQuery(): Promise<void> {
        const queryId = this.ParsedSpec?.Context?.QueryID;
        if (!queryId) return;

        try {
            const rv = new RunView();
            const res = await rv.RunView<{ ID: string; Name: string; SQL: string }>({
                EntityName: 'MJ: Queries',
                ExtraFilter: `ID = '${EscapeSQLString(queryId)}'`,
                Fields: ['ID', 'Name', 'SQL'],
                ResultType: 'simple',
            });
            if (res.Success && res.Results && res.Results.length > 0) {
                this.LoadedQuery = res.Results[0];
                this.cdr.markForCheck();
            } else if (!res.Success) {
                LogError(`[RecordProcessForm] Failed to load context query ${queryId}: ${res.ErrorMessage}`);
            }
        } catch (e) {
            LogError(`[RecordProcessForm] Exception loading context query ${queryId}`, undefined, e);
        }
    }

    public get TargetEntityName(): string {
        if (!this.record?.EntityID) return '—';
        const entity = this.ProviderToUse.EntityByID(this.record.EntityID);
        return entity?.DisplayName || entity?.Name || this.record.EntityID;
    }

    public get TargetEntityInfo(): EntityInfo | undefined {
        if (!this.record?.EntityID) return undefined;
        return this.ProviderToUse.EntityByID(this.record.EntityID);
    }

    public get WorkTypeIcon(): string {
        switch (this.record?.WorkType) {
            case 'Infer':
                return 'fa-solid fa-wand-magic-sparkles';
            case 'FieldRules':
                return 'fa-solid fa-table-list';
            case 'ML Model':
                return 'fa-solid fa-brain';
            case 'Action':
                return 'fa-solid fa-bolt';
            case 'Agent':
                return 'fa-solid fa-robot';
            default:
                return 'fa-solid fa-gears';
        }
    }

    public get StatusBadgeClass(): string {
        switch (this.record?.Status) {
            case 'Active':
                return 'rpf-status-active';
            case 'Draft':
                return 'rpf-status-draft';
            case 'Disabled':
                return 'rpf-status-disabled';
            default:
                return 'rpf-status-default';
        }
    }

    public OnPipelineSpecChange(): void {
        this.cdr.markForCheck();
    }

    public OnPipelineValidChange(valid: boolean): void {
        this.PipelineValid = valid;
        this.cdr.markForCheck();
    }

    public ToggleRawJson(): void {
        this.RawJsonExpanded = !this.RawJsonExpanded;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleRawJson}. */
    public toggleRawJson(): void {
        return this.ToggleRawJson();
    }

    public async CopyRawJson(): Promise<void> {
        try {
            if (navigator?.clipboard && this.FormattedRawJson) {
                await navigator.clipboard.writeText(this.FormattedRawJson);
                this.RawJsonCopied = true;
                this.cdr.markForCheck();
                setTimeout(() => {
                    this.RawJsonCopied = false;
                    this.cdr.markForCheck();
                }, 2000);
            }
        } catch (e) {
            LogError('[RecordProcessForm] Failed to copy raw JSON to clipboard', undefined, e);
        }
    }

    /** @deprecated Use {@link CopyRawJson}. */
    public async copyRawJson(): Promise<void> {
        return this.CopyRawJson();
    }

    public get FormattedRawJson(): string {
        return FormatRawPipelineJson(this.record?.Configuration);
    }

    public get ParsedSpec(): DataFeatureSpec | null {
        return ParsePipelineSpec(this.record?.Configuration);
    }

    public get EntityStub(): EntityMetadataStub | undefined {
        const entity = this.TargetEntityInfo;
        if (!entity) return undefined;
        return {
            Name: entity.Name,
            Fields: (entity.Fields ?? []).map((f) => ({
                Name: f.Name,
                TSType: f.TSType,
                IsVirtual: f.IsVirtual,
                AllowsNull: f.AllowsNull,
                RelatedEntity: f.RelatedEntity,
                RelatedEntityID: f.RelatedEntityID,
                EntityFieldValues: f.EntityFieldValues
                    ? f.EntityFieldValues.map((v) => ({ Value: v.Value, Code: v.Code }))
                    : undefined,
            })),
        };
    }

    public get SpecIssues(): SpecValidationIssue[] {
        return ValidatePipelineSpec(this.ParsedSpec, this.EntityStub);
    }

    public get IsSpecValid(): boolean {
        return this.SpecIssues.filter((i) => i.Severity === 'error').length === 0;
    }

    public get FeatureOutputs(): FeatureOutputViewModel[] {
        return BuildFeatureOutputViewModels(this.ParsedSpec, this.TargetEntityInfo, this.record?.OutputMapping);
    }

    public get TotalFeaturesCount(): number {
        return this.FeatureOutputs.length;
    }

    public get BoundFeaturesCount(): number {
        return this.FeatureOutputs.filter((f) => f.TargetFieldExists).length;
    }

    public get ParameterMappings(): PromptParamViewModel[] {
        return BuildPromptParamViewModels(this.ParsedSpec, this.record?.InputMapping);
    }

    public get ContextModeText(): string {
        const spec = this.ParsedSpec;
        if (spec?.Context?.EntityDocumentID) return 'Entity Document Template';
        if (spec?.Context?.QueryID) {
            return this.LoadedQuery?.Name ? `Query: ${this.LoadedQuery.Name}` : `Saved Query (${spec.Context.QueryID.substring(0, 8)}...)`;
        }
        if (spec?.Context?.Fields && spec.Context.Fields.length > 0) return `Fields (${spec.Context.Fields.join(', ')})`;
        return 'Record Fields (Automatic)';
    }

    public get ContextQueryDisplay(): string {
        const spec = this.ParsedSpec;
        if (spec?.Context?.QueryID) {
            if (this.LoadedQuery?.SQL) {
                return `-- Saved Query: ${this.LoadedQuery.Name}\n${this.LoadedQuery.SQL}`;
            }
            const paramName = spec.Context.QueryParams ? Object.keys(spec.Context.QueryParams)[0] || 'RecordID' : 'RecordID';
            return `-- Saved Query: ${spec.Context.QueryID}\nSELECT a.* FROM ${this.TargetEntityName || 'TargetEntity'} a WHERE a.ID = @${paramName}`;
        }
        return `SELECT a.* FROM ${this.TargetEntityName || 'TargetEntity'} a WHERE a.ID = @RecordID`;
    }

    public get FormattedScopeFilter(): string {
        return this.record?.ScopeFilter?.trim() || '';
    }
}

/**
 * Form policy ensuring the Overview panel sits as the lead group
 * on the left-nav rail with proper title and icon.
 */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: Record Processes', metadata: { entity: 'MJ: Record Processes' } })
export class RecordProcessFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        const detailsGroup = spec.Groups.find(g => g.Key === DETAILS_SECTION_KEY || g.Key === 'details');
        if (detailsGroup) {
            detailsGroup.Title = 'Overview';
            detailsGroup.Icon = 'fa-solid fa-gauge-high';
            detailsGroup.IsLead = true;
        }
        const overview = spec.Groups.find(g => g.Key === 'processOverview');
        if (overview) {
            overview.IsLead = true;
            const remaining = spec.Groups.filter(g => g.Key !== 'processOverview');
            return {
                ...spec,
                Groups: [overview, ...remaining],
            };
        }
        return spec;
    }
}

/** Tree-shaking guard so the override and policy register with the ClassFactory. */
export function LoadRecordProcessFormComponentExtended(): void {
    void RecordProcessFormComponentExtended;
    void RecordProcessFormPolicy;
}
