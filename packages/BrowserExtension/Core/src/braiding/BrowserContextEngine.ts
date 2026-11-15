/**
 * @fileoverview `BrowserContextEngine` — Multi-App Context "Braiding" Engine for the
 * MemberJunction Browser Extension.
 *
 * Extends {@link BaseSingleton} from `@memberjunction/global` and performs two-stage
 * batched `RunViews()` resolution:
 * - **Stage 1 (Anchor Entity Resolution):** Matches the active tab URL against declarative
 *   {@link BrowserContextRuleSpec} rules, extracts page signals via {@link BaseBrowserPageExtractor}
 *   (or a `@RegisterClass`-registered custom extractor such as {@link LinkedInPageExtractor}),
 *   and executes a single batched `RunViews()` call to resolve Anchor Entities (`Organizations`,
 *   `People`, etc.).
 * - **Stage 2 (Cross-App Facet Braiding):** For every matched Anchor Entity, collects all
 *   {@link BrowserEntityFacetSpec} declarations targeting that `AnchorEntityName` across all
 *   installed Open Apps (Sales, Recruiting/ATS, Caliber, Tasks, Betty/Association) and executes
 *   a second single batched `RunViews()` call in parallel.
 * - **Page-to-Entity Diffing & 1-Click Capture:** Computes field-level diffs (`add`, `update`,
 *   `unchanged`) between extracted page metadata and the MJ entity record, or surfaces a 1-click
 *   creation candidate when no record exists yet (`AllowCreateIfUnmatched: true`).
 *
 * @module @memberjunction/browser-extension-core
 */

import { BaseEntity, CompositeKey, type IMetadataProvider, Metadata, RunView, type RunViewParams } from '@memberjunction/core';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import type {
    BraidedEntityContextMatch,
    BraidedEntityFacetItem,
    BraidedEntityFacetResult,
    BraidedPageContextPayload,
    BrowserAnchorEntityMatch,
    BrowserContextRuleSpec,
    BrowserEntityFacetSpec,
    BrowserEntityFieldDiff,
    BrowserPageStateSnapshot,
    UnmatchedPageEntityCandidate,
} from '../types/extension-types.js';
import { MatchWildcardPattern } from '../security/SensitivePageGuard.js';
import { BaseBrowserPageExtractor, type ExtractedPageSignals } from './BaseBrowserPageExtractor.js';
import { LoadStandardPageExtractor, StandardPageExtractor } from './StandardPageExtractor.js';
import { LoadLinkedInPageExtractor } from './LinkedInPageExtractor.js';
import {
    REFERENCE_BROWSER_CONTEXT_RULES,
    REFERENCE_BROWSER_ENTITY_FACETS,
} from './ReferenceOpenAppConfigs.js';

// Ensure standard and LinkedIn extractors are registered in ClassFactory
LoadStandardPageExtractor();
LoadLinkedInPageExtractor();

/**
 * Lightweight row returned by a batched view query.
 */
export type BrowserEntityViewRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Result of a single view query within `IBrowserEntityViewRunner.RunViews`.
 */
export interface BrowserEntityViewResult {
    Success: boolean;
    Results: BrowserEntityViewRow[];
    TotalRowCount: number;
    ErrorMessage?: string;
}

/**
 * Pluggable batched view runner interface (backed by MemberJunction `RunView.RunViews` in production
 * or an in-memory/mock runner in tests).
 */
export interface IBrowserEntityViewRunner {
    RunViews(params: RunViewParams[]): Promise<BrowserEntityViewResult[]>;
}

/**
 * Pluggable persistence adapter for 1-click Page-to-Entity creation and field enrichment.
 */
export interface IBrowserEntityPersistenceAdapter {
    CreateRecord(
        entityName: string,
        fields: Record<string, string>
    ): Promise<{ Success: boolean; RecordID?: string; ErrorMessage?: string }>;
    UpdateRecord(
        entityName: string,
        recordId: string,
        fields: Record<string, string>
    ): Promise<{ Success: boolean; ErrorMessage?: string }>;
}

/**
 * Default `IBrowserEntityViewRunner` delegating to MemberJunction's `RunView.RunViews()`.
 */
export class MJRunViewBatchAdapter implements IBrowserEntityViewRunner {
    public async RunViews(params: RunViewParams[]): Promise<BrowserEntityViewResult[]> {
        if (params.length === 0) {
            return [];
        }
        const rv = new RunView();
        const rawResults = await rv.RunViews<BrowserEntityViewRow>(params);
        return rawResults.map((r) => ({
            Success: r.Success,
            Results: r.Results ?? [],
            TotalRowCount: r.TotalRowCount ?? (r.Results ? r.Results.length : 0),
            ErrorMessage: r.ErrorMessage,
        }));
    }
}

/**
 * Default `IBrowserEntityPersistenceAdapter` delegating to MemberJunction's `Metadata.GetEntityObject()`
 * and `BaseEntity.SetMany()` / `Save()` for 1-click Page-to-Entity creation and field enrichment.
 */
export class MJMetadataPersistenceAdapter implements IBrowserEntityPersistenceAdapter {
    private readonly provider?: IMetadataProvider;

    public constructor(provider?: IMetadataProvider) {
        this.provider = provider;
    }

    public async CreateRecord(
        entityName: string,
        fields: Record<string, string>
    ): Promise<{ Success: boolean; RecordID?: string; ErrorMessage?: string }> {
        try {
            const md = this.provider ?? new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>(entityName);
            entity.NewRecord();
            entity.SetMany(fields, true);
            const saved = await entity.Save();
            if (!saved) {
                return {
                    Success: false,
                    ErrorMessage:
                        entity.LatestResult?.CompleteMessage ||
                        `Failed to create "${entityName}" record.`,
                };
            }
            const pkVal = entity.PrimaryKey.Values();
            return {
                Success: true,
                RecordID: pkVal || undefined,
            };
        } catch (err: unknown) {
            return {
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    public async UpdateRecord(
        entityName: string,
        recordId: string,
        fields: Record<string, string>
    ): Promise<{ Success: boolean; ErrorMessage?: string }> {
        try {
            const md = this.provider ?? new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>(entityName);
            const key = CompositeKey.FromRecordID(entity.EntityInfo, recordId);
            const loaded = await entity.InnerLoad(key);
            if (!loaded) {
                return {
                    Success: false,
                    ErrorMessage: `Could not load "${entityName}" record "${recordId}" for enrichment.`,
                };
            }
            entity.SetMany(fields, true);
            const saved = await entity.Save();
            if (!saved) {
                return {
                    Success: false,
                    ErrorMessage:
                        entity.LatestResult?.CompleteMessage ||
                        `Failed to update "${entityName}" record "${recordId}".`,
                };
            }
            return {
                Success: true,
            };
        } catch (err: unknown) {
            return {
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }
}

/**
 * Multi-App Context Braiding Engine (`BaseSingleton`).
 */
export class BrowserContextEngine extends BaseSingleton<BrowserContextEngine> {
    private rules: BrowserContextRuleSpec[] = [...REFERENCE_BROWSER_CONTEXT_RULES];
    private facets: BrowserEntityFacetSpec[] = [...REFERENCE_BROWSER_ENTITY_FACETS];
    private viewRunner: IBrowserEntityViewRunner = new MJRunViewBatchAdapter();
    private persistenceAdapter: IBrowserEntityPersistenceAdapter | null = new MJMetadataPersistenceAdapter();
    private readonly defaultExtractor = new StandardPageExtractor();

    protected constructor() {
        super();
    }

    /**
     * Singleton instance of `BrowserContextEngine`.
     */
    public static get Instance(): BrowserContextEngine {
        return super.getInstance<BrowserContextEngine>();
    }

    /**
     * Configures the active context rules and entity facets (e.g., merged from `IAgentSettings.BrowserExtension`
     * and installed Open Apps).
     */
    public Configure(options: {
        ContextRules?: BrowserContextRuleSpec[];
        EntityFacets?: BrowserEntityFacetSpec[];
        ViewRunner?: IBrowserEntityViewRunner;
        PersistenceAdapter?: IBrowserEntityPersistenceAdapter | null;
    }): void {
        if (options.ContextRules) {
            this.rules = [...options.ContextRules].sort(
                (a, b) => (a.Priority ?? 100) - (b.Priority ?? 100)
            );
        }
        if (options.EntityFacets) {
            this.facets = [...options.EntityFacets];
        }
        if (options.ViewRunner) {
            this.viewRunner = options.ViewRunner;
        }
        if (options.PersistenceAdapter !== undefined) {
            this.persistenceAdapter = options.PersistenceAdapter;
        }
    }

    /**
     * Registers additional Open App context rules and facets without replacing existing ones.
     */
    public RegisterOpenAppBraiding(
        rules: BrowserContextRuleSpec[],
        facets: BrowserEntityFacetSpec[]
    ): void {
        this.rules = [...this.rules, ...rules].sort(
            (a, b) => (a.Priority ?? 100) - (b.Priority ?? 100)
        );
        this.facets = [...this.facets, ...facets];
    }

    /**
     * Returns the currently configured context rules sorted by ascending `Priority`.
     */
    public GetContextRules(): readonly BrowserContextRuleSpec[] {
        return this.rules;
    }

    /**
     * Returns the currently configured entity facets.
     */
    public GetEntityFacets(): readonly BrowserEntityFacetSpec[] {
        return this.facets;
    }

    /**
     * Resolves the full Multi-App Braided Context for a page snapshot in at most two batched
     * `RunViews()` calls (Stage 1: Anchor Entities; Stage 2: Cross-App Entity Facets).
     */
    public async ResolveBraidedContext(
        snapshot: BrowserPageStateSnapshot
    ): Promise<BraidedPageContextPayload> {
        const matchingRules = this.findMatchingRules(snapshot.Url);
        if (matchingRules.length === 0) {
            return {
                PageSnapshot: snapshot,
                Matches: [],
                UnmatchedCandidates: [],
                ResolvedAtIso: new Date().toISOString(),
            };
        }

        // Prepare Stage 1 queries for all matching rules that produce a non-empty filter
        const stage1Entries: Array<{
            Rule: BrowserContextRuleSpec;
            Extracted: ExtractedPageSignals;
            Filter: string;
        }> = [];

        for (const rule of matchingRules) {
            const extractor = this.resolveExtractor(rule.CustomExtractorClass);
            const extracted = extractor.Extract(snapshot, rule);
            const filter = this.interpolateFilterTemplate(
                rule.LookupFilterTemplate,
                extracted.SignalsByKey
            );
            if (filter) {
                stage1Entries.push({
                    Rule: rule,
                    Extracted: extracted,
                    Filter: filter,
                });
            }
        }

        if (stage1Entries.length === 0) {
            return {
                PageSnapshot: snapshot,
                Matches: [],
                UnmatchedCandidates: [],
                ResolvedAtIso: new Date().toISOString(),
            };
        }

        // Stage 1: Single batched RunViews() call for all candidate Anchor Entities
        const stage1Params: RunViewParams[] = stage1Entries.map((entry) => ({
            EntityName: entry.Rule.TargetEntityName,
            ExtraFilter: entry.Filter,
            MaxRows: 5,
            ResultType: 'simple',
        }));

        const stage1Results = await this.viewRunner.RunViews(stage1Params);

        const resolvedAnchors: Array<{
            Anchor: BrowserAnchorEntityMatch;
            Diffs: BrowserEntityFieldDiff[];
        }> = [];
        const unmatchedCandidates: UnmatchedPageEntityCandidate[] = [];

        stage1Entries.forEach((entry, idx) => {
            const viewRes = stage1Results[idx];
            const rows = viewRes?.Success ? viewRes.Results : [];
            if (rows.length > 0) {
                for (const row of rows) {
                    const recordId = String(row['ID'] ?? row['Id'] ?? row['id'] ?? '');
                    if (!recordId) {
                        continue;
                    }
                    const displayName = String(
                        row['Name'] ??
                        row['FullName'] ??
                        row['Title'] ??
                        row['Email'] ??
                        recordId
                    );
                    const recordFields = this.normalizeRowToStringMap(row);
                    const anchor: BrowserAnchorEntityMatch = {
                        RuleName: entry.Rule.Name,
                        EntityName: entry.Rule.TargetEntityName,
                        RecordID: recordId,
                        RecordDisplayName: displayName,
                        RecordFields: recordFields,
                        ExtractedPageSignals: entry.Extracted.CandidateEntityFields,
                    };
                    const diffs = this.ComputeFieldDiffs(
                        entry.Extracted.CandidateEntityFields,
                        recordFields
                    );
                    resolvedAnchors.push({ Anchor: anchor, Diffs: diffs });
                }
            } else if (entry.Rule.AllowCreateIfUnmatched) {
                const diffs = this.ComputeFieldDiffs(
                    entry.Extracted.CandidateEntityFields,
                    {}
                );
                if (diffs.length > 0) {
                    unmatchedCandidates.push({
                        RuleName: entry.Rule.Name,
                        TargetEntityName: entry.Rule.TargetEntityName,
                        ProposedFields: diffs,
                    });
                }
            }
        });

        // Stage 2: Collect all matching BrowserEntityFacetSpec across all resolved Anchor Entities
        // and execute a single batched RunViews() call
        const stage2Plan: Array<{
            AnchorIndex: number;
            FacetSpec: BrowserEntityFacetSpec;
            Params: RunViewParams;
        }> = [];

        resolvedAnchors.forEach((item, anchorIdx) => {
            const matchingFacets = this.facets.filter(
                (f) => f.AnchorEntityName.toLowerCase() === item.Anchor.EntityName.toLowerCase()
            );
            for (const facet of matchingFacets) {
                const safeId = this.escapeSqlLiteral(item.Anchor.RecordID);
                const fkFilter = `${facet.ForeignKeyField} = '${safeId}'`;
                const extraFilter = facet.ExtraFilter
                    ? `(${fkFilter}) AND (${facet.ExtraFilter})`
                    : fkFilter;

                stage2Plan.push({
                    AnchorIndex: anchorIdx,
                    FacetSpec: facet,
                    Params: {
                        EntityName: facet.FacetEntityName,
                        ExtraFilter: extraFilter,
                        OrderBy: facet.OrderBy,
                        MaxRows: facet.MaxRecords ?? 5,
                        ResultType: 'simple',
                    },
                });
            }
        });

        const facetsByAnchorIndex = new Map<number, BraidedEntityFacetResult[]>();
        resolvedAnchors.forEach((_, idx) => facetsByAnchorIndex.set(idx, []));

        if (stage2Plan.length > 0) {
            const stage2Results = await this.viewRunner.RunViews(
                stage2Plan.map((p) => p.Params)
            );
            stage2Plan.forEach((planItem, idx) => {
                const res = stage2Results[idx];
                const rows = res?.Success ? res.Results : [];
                const facetResult = this.mapRowsToFacetResult(
                    planItem.FacetSpec,
                    rows,
                    res?.TotalRowCount ?? rows.length
                );
                facetsByAnchorIndex.get(planItem.AnchorIndex)?.push(facetResult);
            });
        }

        const braidedMatches: BraidedEntityContextMatch[] = resolvedAnchors.map((item, idx) => ({
            Anchor: item.Anchor,
            Facets: facetsByAnchorIndex.get(idx) ?? [],
            FieldDiffs: item.Diffs,
        }));

        return {
            PageSnapshot: snapshot,
            Matches: braidedMatches,
            UnmatchedCandidates: unmatchedCandidates,
            ResolvedAtIso: new Date().toISOString(),
        };
    }

    /**
     * Computes field-level diffs (`add`, `update`, `unchanged`) between extracted page fields
     * and an existing MemberJunction entity record's fields.
     */
    public ComputeFieldDiffs(
        extractedPageFields: Record<string, string>,
        existingRecordFields: Record<string, string | number | boolean | null>
    ): BrowserEntityFieldDiff[] {
        const diffs: BrowserEntityFieldDiff[] = [];

        for (const [fieldName, rawPageValue] of Object.entries(extractedPageFields)) {
            const pageValue = rawPageValue.trim();
            if (!pageValue) {
                continue;
            }
            const existingRaw = existingRecordFields[fieldName];
            const currentEntityValue =
                existingRaw === null || existingRaw === undefined
                    ? null
                    : String(existingRaw).trim();

            if (!currentEntityValue) {
                diffs.push({
                    FieldName: fieldName,
                    FieldLabel: this.formatFieldLabel(fieldName),
                    CurrentEntityValue: null,
                    ExtractedPageValue: pageValue,
                    Status: 'add',
                    SelectedForApply: true,
                });
            } else if (currentEntityValue.toLowerCase() !== pageValue.toLowerCase()) {
                diffs.push({
                    FieldName: fieldName,
                    FieldLabel: this.formatFieldLabel(fieldName),
                    CurrentEntityValue: currentEntityValue,
                    ExtractedPageValue: pageValue,
                    Status: 'update',
                    SelectedForApply: true,
                });
            } else {
                diffs.push({
                    FieldName: fieldName,
                    FieldLabel: this.formatFieldLabel(fieldName),
                    CurrentEntityValue: currentEntityValue,
                    ExtractedPageValue: pageValue,
                    Status: 'unchanged',
                    SelectedForApply: false,
                });
            }
        }

        return diffs;
    }

    /**
     * Applies 1-click Page-to-Entity creation or field enrichment for the selected diff fields.
     */
    public async ApplyCaptureOrEnrichment(request: {
        EntityName: string;
        RecordID?: string;
        Diffs: BrowserEntityFieldDiff[];
    }): Promise<{ Success: boolean; RecordID?: string; UpdatedFields: string[]; ErrorMessage?: string }> {
        if (!this.persistenceAdapter) {
            return {
                Success: false,
                UpdatedFields: [],
                ErrorMessage: 'No IBrowserEntityPersistenceAdapter is configured on BrowserContextEngine.',
            };
        }

        const fieldsToApply: Record<string, string> = {};
        const updatedFields: string[] = [];

        for (const diff of request.Diffs) {
            if (diff.SelectedForApply && (diff.Status === 'add' || diff.Status === 'update')) {
                fieldsToApply[diff.FieldName] = diff.ExtractedPageValue;
                updatedFields.push(diff.FieldName);
            }
        }

        if (updatedFields.length === 0) {
            return {
                Success: true,
                RecordID: request.RecordID,
                UpdatedFields: [],
            };
        }

        if (request.RecordID) {
            const res = await this.persistenceAdapter.UpdateRecord(
                request.EntityName,
                request.RecordID,
                fieldsToApply
            );
            return {
                Success: res.Success,
                RecordID: request.RecordID,
                UpdatedFields: res.Success ? updatedFields : [],
                ErrorMessage: res.ErrorMessage,
            };
        }

        const createRes = await this.persistenceAdapter.CreateRecord(
            request.EntityName,
            fieldsToApply
        );
        return {
            Success: createRes.Success,
            RecordID: createRes.RecordID,
            UpdatedFields: createRes.Success ? updatedFields : [],
            ErrorMessage: createRes.ErrorMessage,
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private findMatchingRules(url: string): BrowserContextRuleSpec[] {
        if (!url) {
            return [];
        }
        return this.rules.filter((rule) => this.matchesUrlPattern(url, rule.UrlPattern));
    }

    private matchesUrlPattern(url: string, pattern: string): boolean {
        const trimmed = pattern.trim();
        if (!trimmed || trimmed === '*://*/*' || trimmed === '*') {
            return true;
        }
        return MatchWildcardPattern(trimmed, url);
    }

    private resolveExtractor(customClass?: string): BaseBrowserPageExtractor {
        if (!customClass) {
            return this.defaultExtractor;
        }
        try {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseBrowserPageExtractor>(
                BaseBrowserPageExtractor,
                customClass
            );
            return instance ?? this.defaultExtractor;
        } catch {
            return this.defaultExtractor;
        }
    }

    /**
     * Safely interpolates `{{signal_0}}` / `{{HostnameRoot}}` placeholders in `LookupFilterTemplate`
     * with SQL-escaped values. Returns `null` if any referenced placeholder is missing or empty.
     */
    private interpolateFilterTemplate(
        template: string,
        signalsByKey: Record<string, string>
    ): string | null {
        let missingSignal = false;
        const interpolated = template.replace(/\{\{([^}]{1,80})\}\}/g, (_match, rawKey: string) => {
            const key = rawKey.trim();
            const val = signalsByKey[key];
            if (!val || val.trim().length === 0) {
                missingSignal = true;
                return '';
            }
            return this.escapeSqlLiteral(val.trim());
        });

        if (missingSignal || !interpolated.trim()) {
            return null;
        }
        return interpolated;
    }

    private escapeSqlLiteral(val: string): string {
        return val.replace(/'/g, "''");
    }

    private normalizeRowToStringMap(
        row: BrowserEntityViewRow
    ): Record<string, string | number | boolean | null> {
        const out: Record<string, string | number | boolean | null> = {};
        for (const [k, v] of Object.entries(row)) {
            out[k] = v === undefined ? null : v;
        }
        return out;
    }

    private mapRowsToFacetResult(
        facet: BrowserEntityFacetSpec,
        rows: BrowserEntityViewRow[],
        totalCount: number
    ): BraidedEntityFacetResult {
        const items: BraidedEntityFacetItem[] = rows.map((row) => {
            const recordId = String(row['ID'] ?? row['Id'] ?? row['id'] ?? '');
            const title = String(row[facet.CardTemplate.TitleField] ?? recordId);
            const subtitle = facet.CardTemplate.SubtitleField && row[facet.CardTemplate.SubtitleField] != null
                ? String(row[facet.CardTemplate.SubtitleField])
                : undefined;
            const badge = facet.CardTemplate.BadgeField && row[facet.CardTemplate.BadgeField] != null
                ? String(row[facet.CardTemplate.BadgeField])
                : undefined;

            const summaryValues: Record<string, string> = {};
            for (const sf of facet.CardTemplate.SummaryFields ?? []) {
                if (row[sf] != null) {
                    summaryValues[sf] = String(row[sf]);
                }
            }

            return {
                RecordID: recordId,
                Title: title,
                Subtitle: subtitle,
                Badge: badge,
                SummaryValues: summaryValues,
            };
        });

        return {
            AnchorEntityName: facet.AnchorEntityName,
            EntityName: facet.FacetEntityName,
            HeaderTitle: facet.CardTemplate.HeaderTitle,
            Icon: facet.CardTemplate.Icon,
            TotalCount: totalCount,
            Items: items,
        };
    }

    private formatFieldLabel(fieldName: string): string {
        return fieldName
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .trim();
    }
}
