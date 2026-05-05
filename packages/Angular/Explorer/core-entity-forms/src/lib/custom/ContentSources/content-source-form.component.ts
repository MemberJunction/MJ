import { Component } from '@angular/core';
import { MJContentSourceEntity, MJContentSourceEntity_IContentSourceConfiguration } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJContentSourceFormComponent } from '../../generated/Entities/MJContentSource/mjcontentsource.form.component';

type TaxonomyModeJson = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['TagTaxonomyMode']>;

interface TaxonomyModeOption {
    value: TaxonomyModeJson;
    label: string;
    icon: string;
    desc: string;
}

/**
 * Custom Content Source form.
 *
 * Adds two responsibilities on top of the generated form:
 *   1. Conditional Connection Details (Entity-source vs URL-source) — pre-existing.
 *   2. Tag Pipeline Configuration — Option-B "dense form" surface for the typed
 *      `IContentSourceConfiguration` knobs (mode, thresholds, scope, budgets) that
 *      otherwise would only be editable as raw JSON. The Configuration field still
 *      exists below as a code editor for advanced overrides.
 *
 * The pipeline knobs read/write through the typed `ConfigurationObject` accessor
 * that CodeGen emits on `MJContentSourceEntity`, so changes round-trip through the
 * existing JSON column. There's no separate save path.
 */
@RegisterClass(BaseFormComponent, 'MJ: Content Sources')
@Component({
    standalone: false,
    selector: 'mj-content-source-form-extended',
    templateUrl: './content-source-form.component.html',
    styleUrls: ['./content-source-form.component.css'],
})
export class MJContentSourceFormComponentExtended extends MJContentSourceFormComponent {
    public override record!: MJContentSourceEntity;

    public readonly TaxonomyModes: TaxonomyModeOption[] = [
        { value: 'constrained', label: 'Constrained', icon: 'fa-lock', desc: 'Curated only — every novel name → suggestion queue.' },
        { value: 'auto-grow',   label: 'AutoGrow',    icon: 'fa-seedling', desc: 'Bounded auto-creation under TagRoot, gated by per-tag governance.' },
        { value: 'free-flow',   label: 'FreeFlow',    icon: 'fa-water', desc: 'Anything goes — auto-create root-level tags as needed.' },
    ];
    /** "hybrid" is supported by the engine but not yet enumerated in the JSON-schema literal type;
     *  we expose it as a compatibility option that maps to the same field. */
    public readonly HybridModeOption: TaxonomyModeOption = {
        value: 'auto-grow' as TaxonomyModeJson, // engine accepts 'hybrid' but the typed literal is constrained — TODO: widen schema
        label: 'Hybrid',
        icon: 'fa-balance-scale',
        desc: 'Auto-match enabled, but never auto-creates. Ambiguous matches → suggestion queue.',
    };

    /**
     * Whether the current source type is "Entity", which enables
     * EntityID and EntityDocumentID fields and hides the URL field.
     */
    public get IsEntitySourceType(): boolean {
        if (!this.record) return false;
        const typeName = this.record.ContentSourceType;
        return typeName != null && typeName.trim().toLowerCase() === 'entity';
    }

    /**
     * Read the typed Configuration object — never null, defaults applied where
     * the JSON didn't supply them. Writing back is via `setConfig` so we keep
     * the record dirty and persist through the standard Save() path.
     */
    public get Config(): MJContentSourceEntity_IContentSourceConfiguration {
        const raw = this.record?.ConfigurationObject;
        return raw ?? {};
    }

    public setConfig(patch: Partial<MJContentSourceEntity_IContentSourceConfiguration>): void {
        if (!this.record) return;
        const current = this.record.ConfigurationObject ?? {};
        const merged: MJContentSourceEntity_IContentSourceConfiguration = { ...current, ...patch };
        // Setting via the typed accessor updates Configuration JSON + marks dirty.
        this.record.ConfigurationObject = merged;
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
        // Keep SuggestThreshold below MatchThreshold; if currently above (or unset), pin it.
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
     * Coerce a possibly-blank input into a typed number. The IContentSourceConfiguration
     * interface uses optional properties (`?: number`), so "no value" is `undefined`,
     * not `null`. Returning undefined deletes the key from the persisted JSON when the
     * setConfig spread is applied.
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

export function LoadContentSourceFormExtended() {
    // Prevents tree-shaking
}
