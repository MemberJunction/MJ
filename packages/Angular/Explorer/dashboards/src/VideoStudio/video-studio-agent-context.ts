/**
 * @fileoverview Pure helpers for the Video Studio app's AI-agent integration
 * across all three resource surfaces:
 *   1. Productions (`VideoStudioProductionsResource`)
 *   2. Brand Kits (`VideoStudioBrandKitsResource`)
 *   3. Archetypes (`VideoStudioArchetypesResource`)
 *
 * These functions are intentionally free of Angular / DOM dependencies so they
 * can be unit-tested in Node via Vitest. Each Video Studio resource component
 * supplies a plain snapshot of its current state and these helpers shape it
 * into the key-value `AgentContext` object published via
 * `this.navigationService.SetAgentContext(this, ...)`.
 *
 * 🚨 SAFETY BOUNDARY (READ / NAVIGATE / FILTER / SEARCH / REFRESH ONLY):
 * The Video Studio surfaces expose ONLY read, filter, search, select/open-for-viewing,
 * and refresh operations to the AI agent. They NEVER expose create, edit, clone,
 * share, or delete client tools:
 * - Productions: no create/delete production, no share/permission grant (`ArtifactShareModal`
 *   is user-confirm-only), no storyboard/render mutation.
 * - Brand Kits: `OpenBrandKit` opens the `MJ: Brand Kits` entity form for viewing via
 *   `NavigationService.OpenEntityRecord`; no create, save, delete, or asset/policy write
 *   tool is exposed.
 * - Archetypes: `SelectArchetype` / `OpenArchetype` selects or opens a company archetype
 *   record for viewing; cloning a shipped archetype (`CloneArchetype`) creates a new
 *   database record and is gated behind the user-driven Clone dialog only.
 */

import { VideoProductionStatus } from '@memberjunction/video-studio-core';
import { AGENT_CONTEXT_NAME_LIST_CAP, BoundNameList } from '../shared/agent-tool-validation';

/**
 * Upper bound on how many names any Video Studio surface publishes in a
 * name-list context field. Companion `*Count` fields are emitted when a list
 * exceeds this cap.
 */
export const VIDEO_STUDIO_NAME_LIST_CAP = AGENT_CONTEXT_NAME_LIST_CAP;

/**
 * Cap an array of names to {@link VIDEO_STUDIO_NAME_LIST_CAP} entries without
 * mutating the input array.
 */
export function CapVideoStudioNames(names: readonly string[]): string[] {
    return BoundNameList(names, VIDEO_STUDIO_NAME_LIST_CAP);
}

/**
 * Escape single quotes in a string literal for safe embedding in a RunView SQL ExtraFilter.
 */
export function EscapeSqlLiteral(value: string): string {
    return (value ?? '').replace(/'/g, "''");
}


/**
 * Minimal identifiable item shape accepted by {@link ResolveVideoStudioItem}.
 */
export interface NamedVideoStudioItem {
    ID: string;
    Name: string;
}

/**
 * Outcome of {@link ResolveVideoStudioItem}: a matched item, or a tolerant error
 * message listing available names.
 */
export type VideoStudioItemResolution<T extends NamedVideoStudioItem> =
    | { Ok: true; Item: T }
    | { Ok: false; Error: string };

/**
 * Resolve an agent-supplied reference (an ID or a display name) against a list
 * of loaded items in precedence order:
 *   1. Exact `ID` match (case-insensitive)
 *   2. Exact `Name` match (case-insensitive, trimmed)
 *   3. First `Name` substring match (case-insensitive, trimmed)
 *
 * Returns a descriptive error listing up to {@link VIDEO_STUDIO_NAME_LIST_CAP}
 * available names when no item matches. Never throws.
 */
export function ResolveVideoStudioItem<T extends NamedVideoStudioItem>(
    reference: unknown,
    items: readonly T[],
    itemNoun: string,
): VideoStudioItemResolution<T> {
    const raw = typeof reference === 'string' ? reference.trim() : '';
    if (!raw) {
        return { Ok: false, Error: `A ${itemNoun} ID or name is required.` };
    }
    if (items.length === 0) {
        return { Ok: false, Error: `No ${itemNoun}s are currently loaded.` };
    }
    const needle = raw.toLowerCase();

    const byId = items.find((item) => (item.ID ?? '').trim().toLowerCase() === needle);
    if (byId) {
        return { Ok: true, Item: byId };
    }

    const byExactName = items.find((item) => (item.Name ?? '').trim().toLowerCase() === needle);
    if (byExactName) {
        return { Ok: true, Item: byExactName };
    }

    const byPartialName = items.find((item) => (item.Name ?? '').trim().toLowerCase().includes(needle));
    if (byPartialName) {
        return { Ok: true, Item: byPartialName };
    }

    const available = CapVideoStudioNames(
        items.map((item) => (item.Name ?? '').trim()).filter((n) => n.length > 0),
    );
    const suffix = available.length > 0 ? ` Available ${itemNoun}s: ${available.join(', ')}.` : '';
    return {
        Ok: false,
        Error: `No ${itemNoun} matches "${raw}".${suffix}`,
    };
}

// ============================================================================
// 1. PRODUCTIONS SURFACE HELPERS
// ============================================================================

/**
 * Card status for a `Video Production` artifact: one of the canonical
 * {@link VideoProductionStatus} values from `@memberjunction/video-studio-core`,
 * or `'Unknown'` when the artifact version has no recognized `status` attribute.
 */
export type ProductionCardStatus = VideoProductionStatus | 'Unknown';

/**
 * Allowed status filter values on the Productions surface (`'all'` means unfiltered).
 */
export const PRODUCTION_STATUS_FILTERS = [
    'all',
    'Briefing',
    'Styled',
    'Storyboarded',
    'Approved',
    'PreProduced',
    'Composed',
    'RoughCut',
    'Reviewed',
    'Delivered',
    'Blocked',
    'Unknown',
] as const;

export type ProductionStatusFilter = (typeof PRODUCTION_STATUS_FILTERS)[number];

/**
 * Lightweight card model representing one `Video Production` artifact and its
 * latest version's extracted attributes.
 */
export interface ProductionCardSnapshot extends NamedVideoStudioItem {
    ID: string;
    Name: string;
    Description: string;
    VersionID: string | null;
    VersionNumber: number;
    PosterFileID: string | null;
    PosterUrl: string | null;
    Status: ProductionCardStatus;
    Archetype: string;
    BrandKitID: string | null;
    BrandKitName: string | null;
    CompanyID: string | null;
    CompanyName: string | null;
    DurationSeconds: number | null;
    AspectRatio: string | null;
    SceneCount: number | null;
    UpdatedAt: Date;
}

/**
 * Active filter state on the Productions resource.
 */
export interface ProductionFilterState {
    SearchQuery: string;
    Archetype: string;
    BrandKitID: string;
    CompanyID: string;
    Status: string;
    FromDate: string;
    ToDate: string;
}

/**
 * Filter a list of production cards according to {@link ProductionFilterState}.
 * Pure + deterministic; returns a new array without mutating the input.
 */
export function FilterProductionCards<T extends ProductionCardSnapshot>(
    cards: readonly T[],
    filters: ProductionFilterState,
): T[] {
    const query = (filters.SearchQuery ?? '').trim().toLowerCase();
    const archetype = (filters.Archetype ?? '').trim().toLowerCase();
    const brandKitId = (filters.BrandKitID ?? '').trim().toLowerCase();
    const companyId = (filters.CompanyID ?? '').trim().toLowerCase();
    const status = (filters.Status ?? '').trim().toLowerCase();
    const fromTime = ParseFilterDateStart(filters.FromDate);
    const toTime = ParseFilterDateEnd(filters.ToDate);

    return cards.filter((card) => {
        if (query) {
            const haystack = [
                card.Name,
                card.Description,
                card.Archetype,
                card.BrandKitName ?? '',
                card.CompanyName ?? '',
                card.Status,
            ]
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(query)) {
                return false;
            }
        }
        if (archetype && archetype !== 'all') {
            if ((card.Archetype ?? '').trim().toLowerCase() !== archetype) {
                return false;
            }
        }
        if (brandKitId && brandKitId !== 'all') {
            if ((card.BrandKitID ?? '').trim().toLowerCase() !== brandKitId) {
                return false;
            }
        }
        if (companyId && companyId !== 'all') {
            if ((card.CompanyID ?? '').trim().toLowerCase() !== companyId) {
                return false;
            }
        }
        if (status && status !== 'all') {
            if ((card.Status ?? '').trim().toLowerCase() !== status) {
                return false;
            }
        }
        if (fromTime !== null || toTime !== null) {
            const cardTime = card.UpdatedAt instanceof Date ? card.UpdatedAt.getTime() : NaN;
            if (!Number.isFinite(cardTime)) {
                return false;
            }
            if (fromTime !== null && cardTime < fromTime) {
                return false;
            }
            if (toTime !== null && cardTime > toTime) {
                return false;
            }
        }
        return true;
    });
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function ParseFilterDateStart(dateStr: string): number | null {
    const trimmed = (dateStr ?? '').trim();
    if (!trimmed) {
        return null;
    }
    const match = LOCAL_DATE_PATTERN.exec(trimmed);
    if (match) {
        const y = Number(match[1]);
        const m = Number(match[2]);
        const d = Number(match[3]);
        const localStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
        return Number.isFinite(localStart) ? localStart : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function ParseFilterDateEnd(dateStr: string): number | null {
    const trimmed = (dateStr ?? '').trim();
    if (!trimmed) {
        return null;
    }
    const match = LOCAL_DATE_PATTERN.exec(trimmed);
    if (match) {
        const y = Number(match[1]);
        const m = Number(match[2]);
        const d = Number(match[3]);
        const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        return Number.isFinite(localEnd) ? localEnd : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Count how many popover filters are active on the Productions surface
 * (excluding the free-text search box).
 */
export function CountActiveProductionPopoverFilters(filters: ProductionFilterState): number {
    let count = 0;
    if (filters.Archetype && filters.Archetype !== 'all') count++;
    if (filters.BrandKitID && filters.BrandKitID !== 'all') count++;
    if (filters.CompanyID && filters.CompanyID !== 'all') count++;
    if (filters.Status && filters.Status !== 'all') count++;
    if ((filters.FromDate ?? '').trim().length > 0) count++;
    if ((filters.ToDate ?? '').trim().length > 0) count++;
    return count;
}

/**
 * Input snapshot used by {@link BuildProductionsAgentContext}.
 */
export interface ProductionsAgentContextInput {
    TotalCount: number;
    FilteredCards: readonly ProductionCardSnapshot[];
    Filters: ProductionFilterState;
    BrandKitFilterName: string | null;
    CompanyFilterName: string | null;
    SelectedProduction: ProductionCardSnapshot | null;
    AvailableArchetypes: readonly string[];
    AvailableBrandKitNames: readonly string[];
    AvailableCompanyNames: readonly string[];
    IsLoading: boolean;
}

/**
 * Build the bounded, read-only agent context object for the Productions surface.
 */
export function BuildProductionsAgentContext(
    input: ProductionsAgentContextInput,
): Record<string, unknown> {
    const visibleNames = input.FilteredCards.map((c) => c.Name);
    const cappedVisible = CapVideoStudioNames(visibleNames);
    const cappedArchetypes = CapVideoStudioNames(input.AvailableArchetypes);
    const cappedBrandKits = CapVideoStudioNames(input.AvailableBrandKitNames);
    const cappedCompanies = CapVideoStudioNames(input.AvailableCompanyNames);

    const hasSearch = (input.Filters.SearchQuery ?? '').trim().length > 0;
    const popoverFilterCount = CountActiveProductionPopoverFilters(input.Filters);

    const context: Record<string, unknown> = {
        Surface: 'VideoStudioProductions',
        TotalProductionCount: input.TotalCount,
        FilteredProductionCount: input.FilteredCards.length,
        SearchQuery: input.Filters.SearchQuery,
        HasSearch: hasSearch,
        ArchetypeFilter: input.Filters.Archetype || 'all',
        BrandKitFilterId: input.Filters.BrandKitID || 'all',
        BrandKitFilterName: input.BrandKitFilterName,
        CompanyFilterId: input.Filters.CompanyID || 'all',
        CompanyFilterName: input.CompanyFilterName,
        StatusFilter: input.Filters.Status || 'all',
        FromDateFilter: input.Filters.FromDate || null,
        ToDateFilter: input.Filters.ToDate || null,
        HasActiveFilters: hasSearch || popoverFilterCount > 0,
        SelectedProductionId: input.SelectedProduction?.ID ?? null,
        SelectedProductionName: input.SelectedProduction?.Name ?? null,
        SelectedProductionStatus: input.SelectedProduction?.Status ?? null,
        VisibleProductionNames: cappedVisible,
        AvailableArchetypes: cappedArchetypes,
        AvailableBrandKitNames: cappedBrandKits,
        AvailableCompanyNames: cappedCompanies,
        IsLoading: input.IsLoading,
    };

    if (visibleNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['VisibleProductionCount'] = visibleNames.length;
    }
    if (input.AvailableArchetypes.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['AvailableArchetypeCount'] = input.AvailableArchetypes.length;
    }
    if (input.AvailableBrandKitNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['AvailableBrandKitCount'] = input.AvailableBrandKitNames.length;
    }
    if (input.AvailableCompanyNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['AvailableCompanyCount'] = input.AvailableCompanyNames.length;
    }

    return context;
}

// ============================================================================
// 2. BRAND KITS SURFACE HELPERS
// ============================================================================

/**
 * Allowed status filter values on the Brand Kits surface.
 */
export const BRAND_KIT_STATUS_FILTERS = ['all', 'Active', 'Inactive'] as const;
export type BrandKitStatusFilter = (typeof BRAND_KIT_STATUS_FILTERS)[number];

/**
 * Palette swatch item displayed on a Brand Kit card.
 */
export interface BrandKitSwatchView {
    Name: string;
    Value: string;
}

/**
 * Card view-model for a single `MJ: Brand Kits` record on the Brand Kits resource.
 */
export interface BrandKitCardSnapshot extends NamedVideoStudioItem {
    ID: string;
    Name: string;
    Description: string;
    CompanyID: string | null;
    CompanyName: string | null;
    IsDefault: boolean;
    Status: 'Active' | 'Inactive';
    Swatches: readonly BrandKitSwatchView[];
    PrimaryLogoFileID: string | null;
    PrimaryLogoUrl: string | null;
    AssetCount: number;
}

/**
 * Active filter state on the Brand Kits surface.
 * `CompanyID` accepts `'all'`, `'org-wide'`, or a specific company ID.
 */
export interface BrandKitFilterState {
    SearchQuery: string;
    CompanyID: string;
    Status: BrandKitStatusFilter;
}

/**
 * Filter a list of Brand Kit cards according to {@link BrandKitFilterState}.
 * Pure + deterministic; returns a new array without mutating the input.
 */
export function FilterBrandKitCards<T extends BrandKitCardSnapshot>(
    cards: readonly T[],
    filters: BrandKitFilterState,
): T[] {
    const query = (filters.SearchQuery ?? '').trim().toLowerCase();
    const companyFilter = (filters.CompanyID ?? 'all').trim().toLowerCase();
    const statusFilter = (filters.Status ?? 'all').trim().toLowerCase();

    return cards.filter((card) => {
        if (query) {
            const haystack = [
                card.Name,
                card.Description,
                card.CompanyName ?? 'Org-wide',
                card.Status,
            ]
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(query)) {
                return false;
            }
        }
        if (companyFilter && companyFilter !== 'all') {
            if (companyFilter === 'org-wide') {
                if (card.CompanyID !== null) {
                    return false;
                }
            } else if ((card.CompanyID ?? '').trim().toLowerCase() !== companyFilter) {
                return false;
            }
        }
        if (statusFilter && statusFilter !== 'all') {
            if ((card.Status ?? '').trim().toLowerCase() !== statusFilter) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Input snapshot used by {@link BuildBrandKitsAgentContext}.
 */
export interface BrandKitsAgentContextInput {
    AllCards: readonly BrandKitCardSnapshot[];
    FilteredCards: readonly BrandKitCardSnapshot[];
    Filters: BrandKitFilterState;
    CompanyFilterName: string | null;
    AvailableCompanyNames: readonly string[];
    IsLoading: boolean;
}

/**
 * Build the bounded, read-only agent context object for the Brand Kits surface.
 */
export function BuildBrandKitsAgentContext(
    input: BrandKitsAgentContextInput,
): Record<string, unknown> {
    let activeCount = 0;
    let inactiveCount = 0;
    let defaultCount = 0;
    for (const card of input.AllCards) {
        if (card.Status === 'Active') {
            activeCount++;
        } else {
            inactiveCount++;
        }
        if (card.IsDefault) {
            defaultCount++;
        }
    }

    const visibleNames = input.FilteredCards.map((c) => c.Name);
    const cappedVisible = CapVideoStudioNames(visibleNames);
    const cappedCompanies = CapVideoStudioNames(input.AvailableCompanyNames);
    const hasSearch = (input.Filters.SearchQuery ?? '').trim().length > 0;
    const hasPopoverFilter =
        (input.Filters.CompanyID !== '' && input.Filters.CompanyID !== 'all') ||
        (input.Filters.Status !== ('all' as BrandKitStatusFilter));

    const context: Record<string, unknown> = {
        Surface: 'VideoStudioBrandKits',
        TotalBrandKitCount: input.AllCards.length,
        FilteredBrandKitCount: input.FilteredCards.length,
        ActiveBrandKitCount: activeCount,
        InactiveBrandKitCount: inactiveCount,
        DefaultBrandKitCount: defaultCount,
        SearchQuery: input.Filters.SearchQuery,
        HasSearch: hasSearch,
        CompanyFilter: input.Filters.CompanyID || 'all',
        CompanyFilterName: input.CompanyFilterName,
        StatusFilter: input.Filters.Status || 'all',
        HasActiveFilters: hasSearch || hasPopoverFilter,
        VisibleBrandKitNames: cappedVisible,
        AvailableCompanyNames: cappedCompanies,
        IsLoading: input.IsLoading,
    };

    if (visibleNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['VisibleBrandKitCount'] = visibleNames.length;
    }
    if (input.AvailableCompanyNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['AvailableCompanyCount'] = input.AvailableCompanyNames.length;
    }

    return context;
}

// ============================================================================
// 3. ARCHETYPES SURFACE HELPERS
// ============================================================================

/**
 * Canonical `MJ: Video Archetypes.Category` values.
 */
export const ARCHETYPE_CATEGORIES = [
    'Announcement',
    'Briefing',
    'DataStory',
    'Explainer',
    'Product',
    'Social',
    'Tutorial',
] as const;

export type ArchetypeCategory = (typeof ARCHETYPE_CATEGORIES)[number];

/**
 * Allowed category filter values on the Archetypes surface (`'all'` + the 7 categories).
 */
export const ARCHETYPE_CATEGORY_FILTERS = ['all', ...ARCHETYPE_CATEGORIES] as const;
export type ArchetypeCategoryFilter = (typeof ARCHETYPE_CATEGORY_FILTERS)[number];

/**
 * Allowed scope filter values on the Archetypes surface.
 */
export const ARCHETYPE_SCOPE_FILTERS = ['all', 'shipped', 'company'] as const;
export type ArchetypeScopeFilter = (typeof ARCHETYPE_SCOPE_FILTERS)[number];

/**
 * Card view-model for a single `MJ: Video Archetypes` record on the Archetypes resource.
 */
export interface ArchetypeCardSnapshot extends NamedVideoStudioItem {
    ID: string;
    Name: string;
    Description: string;
    Category: ArchetypeCategory;
    Status: 'Active' | 'Inactive';
    CompanyID: string | null;
    CompanyName: string | null;
    IsShipped: boolean;
    DefaultDurationSeconds: number;
    MinDurationSeconds: number;
    MaxDurationSeconds: number;
    DefaultFormats: string;
    BeatCount: number;
    BeatLabels: readonly string[];
}

/**
 * Active filter state on the Archetypes surface.
 */
export interface ArchetypeFilterState {
    SearchQuery: string;
    Category: ArchetypeCategoryFilter;
    Scope: ArchetypeScopeFilter;
}

/**
 * Category group displayed on the Archetypes surface.
 */
export interface ArchetypeCategoryGroup<T extends ArchetypeCardSnapshot = ArchetypeCardSnapshot> {
    Category: ArchetypeCategory;
    Archetypes: T[];
}

/**
 * Filter a list of Archetype cards according to {@link ArchetypeFilterState}.
 * Pure + deterministic; returns a new array without mutating the input.
 */
export function FilterArchetypeCards<T extends ArchetypeCardSnapshot>(
    cards: readonly T[],
    filters: ArchetypeFilterState,
): T[] {
    const query = (filters.SearchQuery ?? '').trim().toLowerCase();
    const category = (filters.Category ?? 'all').trim().toLowerCase();
    const scope = (filters.Scope ?? 'all').trim().toLowerCase();

    return cards.filter((card) => {
        if (query) {
            const haystack = [
                card.Name,
                card.Description,
                card.Category,
                card.CompanyName ?? 'Shipped',
                card.DefaultFormats,
                ...card.BeatLabels,
            ]
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(query)) {
                return false;
            }
        }
        if (category && category !== 'all') {
            if ((card.Category ?? '').trim().toLowerCase() !== category) {
                return false;
            }
        }
        if (scope === 'shipped' && !card.IsShipped) {
            return false;
        }
        if (scope === 'company' && card.IsShipped) {
            return false;
        }
        return true;
    });
}

/**
 * Group filtered archetype cards by `Category` in canonical category order,
 * omitting empty categories. Cards within each category are sorted alphabetically
 * by `Name`.
 */
export function GroupArchetypesByCategory<T extends ArchetypeCardSnapshot>(
    cards: readonly T[],
): ArchetypeCategoryGroup<T>[] {
    const byCategory = new Map<ArchetypeCategory, T[]>();
    for (const card of cards) {
        const list = byCategory.get(card.Category) ?? [];
        list.push(card);
        byCategory.set(card.Category, list);
    }

    const groups: ArchetypeCategoryGroup<T>[] = [];
    for (const category of ARCHETYPE_CATEGORIES) {
        const list = byCategory.get(category);
        if (list && list.length > 0) {
            const sorted = [...list].sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
            groups.push({ Category: category, Archetypes: sorted });
        }
    }
    return groups;
}

/**
 * Input snapshot used by {@link BuildArchetypesAgentContext}.
 */
export interface ArchetypesAgentContextInput {
    AllCards: readonly ArchetypeCardSnapshot[];
    FilteredCards: readonly ArchetypeCardSnapshot[];
    Filters: ArchetypeFilterState;
    SelectedArchetype: ArchetypeCardSnapshot | null;
    IsLoading: boolean;
}

/**
 * Build the bounded, read-only agent context object for the Archetypes surface.
 */
export function BuildArchetypesAgentContext(
    input: ArchetypesAgentContextInput,
): Record<string, unknown> {
    let shippedCount = 0;
    let companyCount = 0;
    for (const card of input.AllCards) {
        if (card.IsShipped) {
            shippedCount++;
        } else {
            companyCount++;
        }
    }

    const visibleNames = input.FilteredCards.map((c) => c.Name);
    const cappedVisible = CapVideoStudioNames(visibleNames);
    const hasSearch = (input.Filters.SearchQuery ?? '').trim().length > 0;
    const hasPopoverFilter =
        input.Filters.Category !== 'all' || input.Filters.Scope !== 'all';

    const context: Record<string, unknown> = {
        Surface: 'VideoStudioArchetypes',
        TotalArchetypeCount: input.AllCards.length,
        FilteredArchetypeCount: input.FilteredCards.length,
        ShippedArchetypeCount: shippedCount,
        CompanyArchetypeCount: companyCount,
        SearchQuery: input.Filters.SearchQuery,
        HasSearch: hasSearch,
        CategoryFilter: input.Filters.Category,
        ScopeFilter: input.Filters.Scope,
        HasActiveFilters: hasSearch || hasPopoverFilter,
        SelectedArchetypeId: input.SelectedArchetype?.ID ?? null,
        SelectedArchetypeName: input.SelectedArchetype?.Name ?? null,
        VisibleArchetypeNames: cappedVisible,
        AvailableCategories: [...ARCHETYPE_CATEGORIES],
        IsLoading: input.IsLoading,
    };

    if (visibleNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['VisibleArchetypeCount'] = visibleNames.length;
    }

    return context;
}

// ============================================================================
// 4. STUDIO SURFACE HELPERS
// ============================================================================

/**
 * Canonical video aspect-ratio format codes selectable in the Studio Start form.
 */
export const STUDIO_VIDEO_FORMATS = ['16:9', '9:16', '1:1', '4:5'] as const;

export type StudioVideoFormat = (typeof STUDIO_VIDEO_FORMATS)[number];

/**
 * Saved query item selectable in the Studio Start form.
 */
export interface StudioSavedQueryItem extends NamedVideoStudioItem {
    ID: string;
    Name: string;
}

/**
 * Parse an archetype's `DefaultFormats` string (JSON array or comma-separated list)
 * into a deduplicated array of canonical {@link StudioVideoFormat} values.
 * Falls back to `['16:9']` when no valid format codes are present.
 */
export function ParseArchetypeDefaultFormats(
    raw: string | null | undefined,
): StudioVideoFormat[] {
    const text = (raw ?? '').trim();
    if (!text) {
        return ['16:9'];
    }

    let tokens: string[] = [];
    if (text.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(text);
            if (Array.isArray(parsed)) {
                tokens = parsed.filter((v): v is string => typeof v === 'string');
            }
        } catch {
            tokens = text.split(',');
        }
    } else {
        tokens = text.split(',');
    }

    const allowed = new Set<string>(STUDIO_VIDEO_FORMATS);
    const seen = new Set<StudioVideoFormat>();
    const result: StudioVideoFormat[] = [];

    for (const token of tokens) {
        const cleaned = token.replace(/['"\[\]\s]/g, '').trim();
        if (allowed.has(cleaned)) {
            const fmt = cleaned as StudioVideoFormat;
            if (!seen.has(fmt)) {
                seen.add(fmt);
                result.push(fmt);
            }
        }
    }

    return result.length > 0 ? result : ['16:9'];
}

/**
 * Clamp a requested duration in seconds to an archetype's `[min, max]` bounds.
 */
export function ClampStudioDuration(
    value: number,
    minSeconds: number,
    maxSeconds: number,
): number {
    const safeMin = Number.isFinite(minSeconds) && minSeconds > 0 ? Math.round(minSeconds) : 5;
    const safeMax =
        Number.isFinite(maxSeconds) && maxSeconds >= safeMin ? Math.round(maxSeconds) : Math.max(safeMin, 180);
    if (!Number.isFinite(value)) {
        return safeMin;
    }
    const rounded = Math.round(value);
    return Math.min(safeMax, Math.max(safeMin, rounded));
}

/**
 * Input to {@link ComposeStudioFirstMessage}.
 */
export interface StudioFirstMessageInput {
    ArchetypeName: string;
    Topic: string;
    DurationSeconds: number;
    Formats: readonly string[];
    BrandKitName?: string | null;
    QueryNames?: readonly string[];
}

/**
 * Deterministic plain-text first message composer for starting a new Studio production:
 * `"Make a <archetype> video, about <topic>, <n> seconds, formats <list>, brand kit <name>, data from <query names>."`
 */
export function ComposeStudioFirstMessage(input: StudioFirstMessageInput): string {
    const archetype = (input.ArchetypeName ?? '').trim() || 'Explainer';
    const topic = (input.Topic ?? '').trim();
    const duration = Number.isFinite(input.DurationSeconds) && input.DurationSeconds > 0
        ? Math.round(input.DurationSeconds)
        : 30;
    const formats =
        input.Formats && input.Formats.length > 0
            ? input.Formats.map((f) => f.trim()).filter((f) => f.length > 0).join(', ')
            : '16:9';
    const brandKit = (input.BrandKitName ?? '').trim() || 'none';
    const queriesList = (input.QueryNames ?? [])
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
    const queriesText = queriesList.length > 0 ? queriesList.join(', ') : 'none';

    return `Make a ${archetype} video, about ${topic}, ${duration} seconds, formats ${formats}, brand kit ${brandKit}, data from ${queriesText}.`;
}

/**
 * Structured `AppContext` payload passed to `<vs-copilot-panel>` when starting a production.
 */
export interface StudioAppContextPayload {
    ArchetypeID: string | null;
    BrandKitID: string | null;
    Formats: string[];
    DurationSeconds: number;
    QueryIDs: string[];
}

/**
 * Build the `{ VideoStudio: { ArchetypeID, BrandKitID, Formats, DurationSeconds, QueryIDs } }`
 * app context object passed into `<vs-copilot-panel>` / `<mj-conversation-chat-area>`.
 */
export function BuildStudioAppContext(
    input: StudioAppContextPayload,
): { VideoStudio: StudioAppContextPayload } {
    return {
        VideoStudio: {
            ArchetypeID: input.ArchetypeID ?? null,
            BrandKitID: input.BrandKitID ?? null,
            Formats: [...(input.Formats ?? [])],
            DurationSeconds: input.DurationSeconds,
            QueryIDs: [...(input.QueryIDs ?? [])],
        },
    };
}

/**
 * Input snapshot used by {@link BuildStudioAgentContext}.
 */
export interface StudioAgentContextInput {
    AllArchetypes: readonly NamedVideoStudioItem[];
    AllBrandKits: readonly NamedVideoStudioItem[];
    SelectedArchetype: ArchetypeCardSnapshot | null;
    SelectedBrandKit: BrandKitCardSnapshot | null;
    SelectedFormats: readonly string[];
    DurationSeconds: number;
    Topic: string;
    SelectedQueries: readonly StudioSavedQueryItem[];
    ActiveConversationId: string | null;
    IsLoading: boolean;
}

/**
 * Build the bounded, read-only agent context object for the Studio surface.
 */
export function BuildStudioAgentContext(
    input: StudioAgentContextInput,
): Record<string, unknown> {
    const archetypeNames = input.AllArchetypes.map((a) => a.Name);
    const brandKitNames = input.AllBrandKits.map((b) => b.Name);
    const queryNames = input.SelectedQueries.map((q) => q.Name);

    const cappedArchetypes = CapVideoStudioNames(archetypeNames);
    const cappedBrandKits = CapVideoStudioNames(brandKitNames);
    const cappedQueries = CapVideoStudioNames(queryNames);

    const trimmedTopic = (input.Topic ?? '').trim();
    const canStart = trimmedTopic.length > 0 && input.SelectedArchetype !== null;

    const context: Record<string, unknown> = {
        Surface: 'VideoStudioStudio',
        TotalArchetypeCount: input.AllArchetypes.length,
        TotalBrandKitCount: input.AllBrandKits.length,
        SelectedArchetypeId: input.SelectedArchetype?.ID ?? null,
        SelectedArchetypeName: input.SelectedArchetype?.Name ?? null,
        SelectedBrandKitId: input.SelectedBrandKit?.ID ?? null,
        SelectedBrandKitName: input.SelectedBrandKit?.Name ?? null,
        SelectedFormats: [...input.SelectedFormats],
        DurationSeconds: input.DurationSeconds,
        MinDurationSeconds: input.SelectedArchetype?.MinDurationSeconds ?? 5,
        MaxDurationSeconds: input.SelectedArchetype?.MaxDurationSeconds ?? 180,
        Topic: trimmedTopic,
        HasTopic: trimmedTopic.length > 0,
        CanStartProduction: canStart,
        SelectedQueryIds: input.SelectedQueries.map((q) => q.ID),
        SelectedQueryNames: cappedQueries,
        AvailableArchetypeNames: cappedArchetypes,
        AvailableBrandKitNames: cappedBrandKits,
        AvailableFormats: [...STUDIO_VIDEO_FORMATS],
        ActiveConversationId: input.ActiveConversationId,
        IsLoading: input.IsLoading,
    };

    if (archetypeNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['AvailableArchetypeCount'] = archetypeNames.length;
    }
    if (brandKitNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['AvailableBrandKitCount'] = brandKitNames.length;
    }
    if (queryNames.length > VIDEO_STUDIO_NAME_LIST_CAP) {
        context['SelectedQueryCount'] = queryNames.length;
    }

    return context;
}

