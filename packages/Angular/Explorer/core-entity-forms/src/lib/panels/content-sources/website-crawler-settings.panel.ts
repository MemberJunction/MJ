import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    MJContentSourceEntity,
    MJContentSourceEntity_IContentSourceConfiguration,
    MJContentSourceEntity_IContentSourceWebsiteConfiguration,
} from '@memberjunction/core-entities';

/**
 * Website Crawler Settings panel — surfaces the typed `Configuration.Website`
 * sub-object (MaxDepth, RootURL, URLPattern, crawl flags) as a dense form.
 * Only meaningful when ContentSourceType = "Website"; the panel silently
 * renders nothing for other source types so it can register against the
 * generic ContentSource slot without conditional templates upstream.
 *
 * Future pluggability: as more source types grow typed config (RSS, Cloud
 * Storage, etc.), each gets its own panel registered against the same slot,
 * each self-gating on ContentSourceType. The slot host doesn't need to know.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'content-sources:website-crawler-settings',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: Content Sources',
        slot: 'after-fields',
        // Lower sortKey than Tag Pipeline (100) so the source-type-specific
        // crawler knobs render BELOW the broadly-applicable budget knobs.
        sortKey: 80,
    },
})
@Component({
    standalone: false,
    selector: 'mj-website-crawler-settings-panel',
    templateUrl: './website-crawler-settings.panel.html',
    styleUrls: ['./tag-pipeline-configuration.panel.css'],
})
export class WebsiteCrawlerSettingsPanel extends BaseFormPanel<MJContentSourceEntity> {
    /** Hide the panel for non-Website source types — keeps the slot registration generic. */
    public get IsWebsiteSourceType(): boolean {
        const typeName = this.Record?.ContentSourceType;
        return typeName != null && typeName.trim().toLowerCase() === 'website';
    }

    private get Config(): MJContentSourceEntity_IContentSourceConfiguration {
        return this.Record?.ConfigurationObject ?? {};
    }

    /** Return the typed Website sub-object, defaulted to {} so getters can read freely. */
    public get WebsiteConfig(): MJContentSourceEntity_IContentSourceWebsiteConfiguration {
        return this.Config.Website ?? {};
    }

    private setConfig(patch: Partial<MJContentSourceEntity_IContentSourceConfiguration>): void {
        if (!this.Record) return;
        const current = this.Record.ConfigurationObject ?? {};
        const merged: MJContentSourceEntity_IContentSourceConfiguration = { ...current, ...patch };
        this.Record.ConfigurationObject = merged;
    }

    private setWebsite(patch: Partial<MJContentSourceEntity_IContentSourceWebsiteConfiguration>): void {
        // Spread for the typed merge, then explicitly remove keys whose patched
        // value was undefined so we don't persist `"key": undefined` artifacts.
        const merged: MJContentSourceEntity_IContentSourceWebsiteConfiguration = { ...this.WebsiteConfig, ...patch };
        for (const key of Object.keys(patch) as Array<keyof MJContentSourceEntity_IContentSourceWebsiteConfiguration>) {
            if (patch[key] === undefined) {
                delete merged[key];
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
        // Default true — matches the autotagger's runtime default.
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
export function LoadWebsiteCrawlerSettingsPanel(): void { /* no-op marker */ }
