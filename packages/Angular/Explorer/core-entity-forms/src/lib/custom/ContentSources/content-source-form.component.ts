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
 * Per-source website crawl knobs surfaced in the form. Mirrors the
 * `IContentSourceWebsiteConfiguration` interface in the metadata JSON-Type
 * file (`metadata/entities/JSONType-interfaces/IContentSourceConfiguration.ts`)
 * one-for-one. Carried locally so this file compiles before CodeGen
 * regenerates the typed accessor on MJContentSourceEntity to include `Website`.
 *
 * NOTE: drop this local declaration after CodeGen regenerates the typed
 * `MJContentSourceEntity_IContentSourceConfiguration` to include `Website`.
 */
interface WebsiteConfig {
    MaxDepth?: number;
    CrawlSitesInLowerLevelDomain?: boolean;
    CrawlOtherSitesInTopLevelDomain?: boolean;
    URLPattern?: string;
    RootURL?: string;
}

/**
 * Transitional widening of the generated typed config accessor — adds the two new
 * fields (`MaxItemsPerRun`, `Website`) that the metadata JSON-Type defines but the
 * generated entity class doesn't know about yet. Cast becomes unnecessary after
 * the user runs CodeGen.
 */
type ExtendedConfig = MJContentSourceEntity_IContentSourceConfiguration & {
    MaxItemsPerRun?: number;
    Website?: WebsiteConfig;
};

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
     * Whether the current source type is "Website", which surfaces the
     * crawler-specific knobs (MaxDepth, URL filter, etc.).
     *
     * NOTE: this is the first source-type-conditional panel beyond Entity. As
     * more source types grow typed config (RSS, Cloud Storage, etc.), this
     * pattern should be promoted to a registered class extension point —
     * each subclass declares its `SourceTypeName` + renders its own section.
     * For now, hard-coding by source type name keeps the wire-up simple.
     */
    public get IsWebsiteSourceType(): boolean {
        if (!this.record) return false;
        const typeName = this.record.ContentSourceType;
        return typeName != null && typeName.trim().toLowerCase() === 'website';
    }

    /**
     * Read the typed Configuration object — never null, defaults applied where
     * the JSON didn't supply them. Writing back is via `setConfig` so we keep
     * the record dirty and persist through the standard Save() path.
     */
    public get Config(): ExtendedConfig {
        const raw = this.record?.ConfigurationObject;
        return (raw ?? {}) as ExtendedConfig;
    }

    public setConfig(patch: Partial<ExtendedConfig>): void {
        if (!this.record) return;
        const current = (this.record.ConfigurationObject ?? {}) as ExtendedConfig;
        const merged: ExtendedConfig = { ...current, ...patch };
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

    // ---------- Website crawler knobs (Configuration.Website sub-object) ---
    //
    // These are only meaningful when ContentSourceType = "Website". The form
    // hides the section for other source types via `IsWebsiteSourceType`.
    // Storage is the typed `Configuration.Website` sub-object on the parent
    // ContentSource — AutotagWebsite reads it first, then overlays per-source
    // ContentSourceParam rows as a legacy / sharper-override path.

    /** Return the typed Website sub-object, defaulted to {} so getters can read freely. */
    public get WebsiteConfig(): WebsiteConfig {
        return this.Config.Website ?? {};
    }

    private setWebsite(patch: Partial<WebsiteConfig>): void {
        const current = this.WebsiteConfig;
        // Spread the patch over current, then strip any keys whose value is undefined
        // so we don't persist `"key": undefined` artifacts in the JSON.
        const merged: WebsiteConfig = { ...current };
        for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) {
                delete (merged as Record<string, unknown>)[k];
            } else {
                (merged as Record<string, unknown>)[k] = v;
            }
        }
        this.setConfig({ Website: merged });
    }

    public get MaxDepthValue(): number | null {
        return this.WebsiteConfig.MaxDepth ?? null;
    }
    public set MaxDepthValue(v: number | string | null) {
        this.setWebsite({ MaxDepth: this.normalizeNullableNumber(v) });
    }

    public get CrawlSitesInLowerLevelDomainValue(): boolean {
        // Default true — matches the autotagger's runtime default. Treat unset
        // and explicit true the same so the toggle starts in the expected state.
        return this.WebsiteConfig.CrawlSitesInLowerLevelDomain !== false;
    }
    public set CrawlSitesInLowerLevelDomainValue(v: boolean) {
        this.setWebsite({ CrawlSitesInLowerLevelDomain: v });
    }

    public get CrawlOtherSitesInTopLevelDomainValue(): boolean {
        // Default false — matches the autotagger's runtime default.
        return this.WebsiteConfig.CrawlOtherSitesInTopLevelDomain === true;
    }
    public set CrawlOtherSitesInTopLevelDomainValue(v: boolean) {
        this.setWebsite({ CrawlOtherSitesInTopLevelDomain: v });
    }

    public get URLPatternValue(): string {
        return this.WebsiteConfig.URLPattern ?? '';
    }
    public set URLPatternValue(v: string | null | undefined) {
        const trimmed = (v ?? '').trim();
        this.setWebsite({ URLPattern: trimmed === '' ? undefined : trimmed });
    }

    public get RootURLValue(): string {
        return this.WebsiteConfig.RootURL ?? '';
    }
    public set RootURLValue(v: string | null | undefined) {
        const trimmed = (v ?? '').trim();
        this.setWebsite({ RootURL: trimmed === '' ? undefined : trimmed });
    }

    /** Live validation: a non-empty URLPattern must be a valid JavaScript regex. */
    public get URLPatternValidationMessage(): string | null {
        const v = this.URLPatternValue;
        if (!v) return null;
        try { new RegExp(v); return null; }
        catch (e) { return `Invalid regex — ${e instanceof Error ? e.message : String(e)}`; }
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
