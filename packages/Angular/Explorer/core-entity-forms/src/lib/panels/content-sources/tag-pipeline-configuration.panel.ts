import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJContentSourceEntity, MJContentSourceEntity_IContentSourceConfiguration } from '@memberjunction/core-entities';

type TaxonomyModeJson = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['TagTaxonomyMode']>;

interface TaxonomyModeOption {
    value: TaxonomyModeJson;
    label: string;
    icon: string;
    desc: string;
}

/**
 * Tag Pipeline Configuration panel — the typed `IContentSourceConfiguration`
 * knobs (mode, thresholds, scope, taxonomy sharing, vectorization toggle, and
 * the five run-budget caps) surfaced as a dense form.
 *
 * Self-registers against the `after-fields` slot for `MJ: Content Sources`.
 * The slot host mounts it dynamically — no consumer template edits required.
 *
 * Also usable as a plain Angular component (composition pattern) — embed
 * directly in any custom UI (e.g. a dashboard quick-edit dialog) by binding
 * `[Record]` to the entity record and (optionally) `[FormComponent]`.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'content-sources:tag-pipeline-configuration',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: Content Sources',
        slot: 'after-fields',
        sortKey: 100,
    },
})
@Component({
    standalone: false,
    selector: 'mj-tag-pipeline-configuration-panel',
    templateUrl: './tag-pipeline-configuration.panel.html',
    styleUrls: ['./tag-pipeline-configuration.panel.css'],
})
export class TagPipelineConfigurationPanel extends BaseFormPanel<MJContentSourceEntity> {
    public readonly TaxonomyModes: TaxonomyModeOption[] = [
        { value: 'constrained', label: 'Constrained', icon: 'fa-lock', desc: 'Curated only — every novel name → suggestion queue.' },
        { value: 'auto-grow',   label: 'AutoGrow',    icon: 'fa-seedling', desc: 'Bounded auto-creation under TagRoot, gated by per-tag governance.' },
        { value: 'free-flow',   label: 'FreeFlow',    icon: 'fa-water', desc: 'Anything goes — auto-create root-level tags as needed.' },
    ];

    /** Read the typed Configuration object — never null, defaults applied where the JSON didn't supply them. */
    public get Config(): MJContentSourceEntity_IContentSourceConfiguration {
        return this.Record?.ConfigurationObject ?? {};
    }

    public setConfig(patch: Partial<MJContentSourceEntity_IContentSourceConfiguration>): void {
        if (!this.Record) return;
        const current = this.Record.ConfigurationObject ?? {};
        const merged: MJContentSourceEntity_IContentSourceConfiguration = { ...current, ...patch };
        this.Record.ConfigurationObject = merged;
    }

    // ---------- Mode -------------------------------------------------------

    public get CurrentMode(): TaxonomyModeJson {
        return this.Config.TagTaxonomyMode ?? 'auto-grow';
    }
    public SetMode(mode: TaxonomyModeJson): void {
        this.setConfig({ TagTaxonomyMode: mode });
    }

    // ---------- Thresholds -------------------------------------------------

    public get MatchThresholdValue(): number {
        return this.Config.TagMatchThreshold ?? 0.85;
    }
    public set MatchThresholdValue(v: number) {
        const clamped = Math.max(0, Math.min(1, Number(v) || 0));
        const cur = this.Config.SuggestThreshold;
        const patch: Partial<MJContentSourceEntity_IContentSourceConfiguration> = { TagMatchThreshold: clamped };
        if (cur == null || cur >= clamped) patch.SuggestThreshold = Math.max(0, clamped - 0.05);
        this.setConfig(patch);
    }
    public get SuggestThresholdValue(): number {
        return this.Config.SuggestThreshold ?? Math.max(0, this.MatchThresholdValue - 0.05);
    }
    public set SuggestThresholdValue(v: number) {
        const clamped = Math.max(0, Math.min(this.MatchThresholdValue, Number(v) || 0));
        this.setConfig({ SuggestThreshold: clamped });
    }
    public get ThresholdValidationMessage(): string | null {
        const m = this.Config.TagMatchThreshold;
        const s = this.Config.SuggestThreshold;
        if (m != null && s != null && s >= m) {
            return 'SuggestThreshold must be lower than MatchThreshold.';
        }
        return null;
    }

    // ---------- Tag root + share-with-LLM ----------------------------------

    public get TagRootIDValue(): string | null {
        return this.Config.TagRootID ?? null;
    }
    public set TagRootIDValue(v: string | null) {
        this.setConfig({ TagRootID: v ?? null });
    }
    public get ShareTaxonomyValue(): boolean {
        return this.Config.ShareTaxonomyWithLLM !== false; // default true
    }
    public set ShareTaxonomyValue(v: boolean) {
        this.setConfig({ ShareTaxonomyWithLLM: v });
    }
    public get EnableVectorizationValue(): boolean {
        return this.Config.EnableVectorization !== false; // default true
    }
    public set EnableVectorizationValue(v: boolean) {
        this.setConfig({ EnableVectorization: v });
    }

    // ---------- Budgets ----------------------------------------------------

    public get MaxItemsPerRunValue(): number | null {
        return this.Config.MaxItemsPerRun ?? null;
    }
    public set MaxItemsPerRunValue(v: number | string | null) {
        this.setConfig({ MaxItemsPerRun: this.normalizeNullableNumber(v) });
    }
    public get MaxNewTagsPerRunValue(): number | null {
        return this.Config.MaxNewTagsPerRun ?? null;
    }
    public set MaxNewTagsPerRunValue(v: number | string | null) {
        this.setConfig({ MaxNewTagsPerRun: this.normalizeNullableNumber(v) });
    }
    public get MaxNewTagsPerItemValue(): number | null {
        return this.Config.MaxNewTagsPerItem ?? null;
    }
    public set MaxNewTagsPerItemValue(v: number | string | null) {
        this.setConfig({ MaxNewTagsPerItem: this.normalizeNullableNumber(v) });
    }
    public get MaxTokensPerRunValue(): number | null {
        return this.Config.MaxTokensPerRun ?? null;
    }
    public set MaxTokensPerRunValue(v: number | string | null) {
        this.setConfig({ MaxTokensPerRun: this.normalizeNullableNumber(v) });
    }
    public get MaxCostPerRunValue(): number | null {
        return this.Config.MaxCostPerRun ?? null;
    }
    public set MaxCostPerRunValue(v: number | string | null) {
        this.setConfig({ MaxCostPerRun: this.normalizeNullableNumber(v) });
    }

    /**
     * Coerce a possibly-blank input into a typed number. Returning undefined
     * deletes the key from the persisted JSON when the setConfig spread is applied.
     */
    private normalizeNullableNumber(v: number | string | null | undefined): number | undefined {
        if (v == null) return undefined;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === '') return undefined;
            const n = Number(trimmed);
            return Number.isFinite(n) ? n : undefined;
        }
        return Number.isFinite(v) ? v : undefined;
    }
}

/** Tree-shake guard — call this from the consuming module's loader. */
export function LoadTagPipelineConfigurationPanel(): void { /* no-op marker */ }
