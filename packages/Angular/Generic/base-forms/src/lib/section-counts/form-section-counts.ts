/**
 * Form section counts — one round trip for every badge on a record form.
 *
 * When a saved record opens, the container asks for the row count of every
 * related section (baked grids, stock fill-in grids, contributions) plus the
 * toolbar's tag / attachment / version badges in ONE `RunViews` call of
 * `count_only` views. The database provider runs an all-`count_only` batch as a
 * single `UNION ALL` statement, and every view keeps the normal RunView security
 * path (CanRead, row-level security, saved-view filters).
 *
 * The counts drive two things:
 * - badges (`showCount`, default on), and
 * - empty-section chrome (`whenEmpty`: `'show'` default | `'hide'` | `'more'`).
 *
 * Everything here is pure (no Angular, no I/O) so it can be unit tested; the
 * container owns the call and the state.
 *
 * @see plans/form-section-counts.md
 */
import {
    BaseEntity,
    EntityInfo,
    EntityRelationshipInfo,
    FormWhenEmpty,
    ReadRelationshipInclusion,
    ReadRelationshipJoinFields,
    ReadRelationshipShowCount,
    ReadRelationshipWhenEmpty,
    ResolveContributionShowCount,
    ResolveContributionWhenEmpty,
    RunViewParams,
    RunViewResult,
} from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import { FormPanelRegistrationMetadata } from '../panel-slot/base-form-panel';
import {
    CreateRelatedEntitySectionKeyResolver,
    StripJoinFieldBrackets,
    VisibleFormRelationships,
} from '../panel-slot/form-contribution';

/** One form section (related grid or contribution) whose rows are counted. */
export interface FormSectionCountTarget {
    SectionKey: string;
    WhenEmpty: FormWhenEmpty;
    ShowCount: boolean;
    /**
     * The count query, or `null` when the section has no count source the form
     * can build (a contribution that reports its own count after it mounts).
     */
    Params: RunViewParams | null;
}

/** Toolbar badges counted in the same round trip. */
export type FormSystemCountKey = 'tags' | 'attachments' | 'versions';

export interface FormSystemCountTarget {
    Key: FormSystemCountKey;
    Params: RunViewParams;
}

export interface FormCountPlan {
    Sections: FormSectionCountTarget[];
    System: FormSystemCountTarget[];
    /**
     * Section keys whose badge is turned off (`showCount: false`), including
     * ones not fetched at all because they are also `whenEmpty: 'show'`. A grid
     * load still records their count; the form just does not badge it.
     */
    SuppressedBadgeKeys: string[];
}

/** A winning contribution registration, keyed by its rail / section key. */
export interface FormCountContribution {
    SectionKey: string;
    Metadata: FormPanelRegistrationMetadata;
}

export interface BuildFormCountPlanInput {
    Record: BaseEntity;
    Entity: EntityInfo;
    /** IS-A child entity IDs (their relationships are not related sections). */
    IsaChildEntityIDs: readonly string[];
    /** Section keys already hidden by a claim / replacement / chrome — never counted as grids. */
    HiddenSectionKeys: ReadonlySet<string>;
    /** Winning contribution registrations for this entity (header excluded). */
    Contributions: readonly FormCountContribution[];
    /** Include the attachment badge (entity allows attachments). */
    IncludeAttachments: boolean;
}

/** Counts that came back; a section / badge whose query failed is absent. */
export interface FormCountResults {
    Sections: Map<string, number>;
    System: Map<FormSystemCountKey, number>;
}

const TAGGED_ITEMS_ENTITY = 'MJ: Tagged Items';
const FILE_LINKS_ENTITY = 'MJ: File Entity Record Links';
const RECORD_CHANGES_ENTITY = 'MJ: Record Changes';

/**
 * Build the list of counts a saved record's form needs. Returns an empty plan
 * for an unsaved record (nothing to count).
 */
export function BuildFormCountPlan(input: BuildFormCountPlanInput): FormCountPlan {
    const { Record: record, Entity: entity } = input;
    if (!record?.IsSaved) return { Sections: [], System: [], SuppressedBadgeKeys: [] };

    // Relationship joins assume a single-column parent key — skip sections
    // (fail open: shown, no badge) for composite-key parents.
    const singleKey = record.PrimaryKeys.length === 1;
    const suppressed = new Set<string>();
    const sections = singleKey
        ? [...buildRelationshipTargets(input, suppressed), ...buildContributionTargets(input, suppressed)]
        : [];
    return { Sections: dedupeByKey(sections), System: buildSystemTargets(input), SuppressedBadgeKeys: [...suppressed] };
}

/** The `RunViews` params for a plan, in a fixed order {@link ApplyFormCountResults} understands. */
export function FormCountPlanParams(plan: FormCountPlan): RunViewParams[] {
    const sectionParams = plan.Sections.filter((s) => s.Params !== null).map((s) => s.Params as RunViewParams);
    return [...sectionParams, ...plan.System.map((s) => s.Params)];
}

/** Map `RunViews` results (same order as {@link FormCountPlanParams}) back to keys. */
export function ApplyFormCountResults(plan: FormCountPlan, results: readonly (RunViewResult | null | undefined)[]): FormCountResults {
    const out: FormCountResults = { Sections: new Map(), System: new Map() };
    let index = 0;
    for (const section of plan.Sections) {
        if (section.Params === null) continue;
        const count = readCount(results[index++]);
        if (count !== null) out.Sections.set(section.SectionKey, count);
    }
    for (const system of plan.System) {
        const count = readCount(results[index++]);
        if (count !== null) out.System.set(system.Key, count);
    }
    return out;
}

/** Where a form is in its count lifecycle for the current record. */
export type FormCountPhase = 'none' | 'loading' | 'loaded' | 'failed';

export interface ResolveEmptySectionBehaviorInput {
    Targets: readonly FormSectionCountTarget[];
    /** Latest known count per section key (prefetch or a grid load). */
    CountOf: (sectionKey: string) => number | undefined;
    Phase: FormCountPhase;
    /** The toolbar's "show empty fields" toggle — reveals everything. */
    ShowEmptyFields: boolean;
    /** Sections that must not be hidden or moved (had rows this session, or are open). */
    StickyKeys: ReadonlySet<string>;
}

/**
 * Which sections the chrome should hide or move to More right now.
 *
 * - Only a section known to have 0 rows is affected.
 * - While the prefetch is in flight, a `'hide'` section with a count query is
 *   held back so it does not appear and then vanish.
 * - Fail open: no counts (unsaved, failed call, failed item) → nothing hidden.
 */
export function ResolveEmptySectionBehavior(input: ResolveEmptySectionBehaviorInput): Map<string, 'hide' | 'more'> {
    const out = new Map<string, 'hide' | 'more'>();
    if (input.ShowEmptyFields || input.Phase === 'none' || input.Phase === 'failed') return out;
    for (const target of input.Targets) {
        if (target.WhenEmpty === 'show' || input.StickyKeys.has(target.SectionKey)) continue;
        const count = input.CountOf(target.SectionKey);
        if (count === 0) {
            out.set(target.SectionKey, target.WhenEmpty);
        } else if (count === undefined && input.Phase === 'loading' && target.WhenEmpty === 'hide' && target.Params !== null) {
            out.set(target.SectionKey, 'hide');
        }
    }
    return out;
}

// ---- relationships ---------------------------------------------------------

function buildRelationshipTargets(input: BuildFormCountPlanInput, suppressed: Set<string>): FormSectionCountTarget[] {
    const { Record: record, Entity: entity } = input;
    const peers = VisibleFormRelationships(entity.RelatedEntities ?? [], input.IsaChildEntityIDs);
    const sectionKeyOf = CreateRelatedEntitySectionKeyResolver(peers);
    const targets: FormSectionCountTarget[] = [];
    for (const rel of peers) {
        const sectionKey = sectionKeyOf(rel);
        if (input.HiddenSectionKeys.has(sectionKey)) continue;
        if (ReadRelationshipInclusion(rel.Configuration) === 'None') continue;
        if (isImpliedJoinSibling(rel, peers)) continue;
        const whenEmpty = ReadRelationshipWhenEmpty(rel.Configuration, entity.Configuration);
        const showCount = ReadRelationshipShowCount(rel.Configuration, entity.Configuration);
        if (!showCount) suppressed.add(sectionKey);
        if (!showCount && whenEmpty === 'show') continue;
        targets.push({
            SectionKey: sectionKey,
            WhenEmpty: whenEmpty,
            ShowCount: showCount,
            Params: countOnly(EntityInfo.BuildRelationshipViewParams(record, rel)),
        });
    }
    return targets;
}

/**
 * A sibling FK folded into another relationship's `join.fields` OR (Bill-To +
 * Ship-To on one section) is not its own section — mirrors the chrome ranker.
 */
function isImpliedJoinSibling(rel: EntityRelationshipInfo, peers: readonly EntityRelationshipInfo[]): boolean {
    if (ReadRelationshipInclusion(rel.Configuration) !== null) return false;
    if (ReadRelationshipJoinFields(rel.Configuration)) return false;
    const target = NormalizeUUID(rel.RelatedEntityID);
    const joinField = StripJoinFieldBrackets(rel.RelatedEntityJoinField)?.toLowerCase();
    return peers.some((peer) => {
        if (peer === rel || NormalizeUUID(peer.RelatedEntityID) !== target) return false;
        const fields = ReadRelationshipJoinFields(peer.Configuration);
        return !!fields && fields.some((f) => f.toLowerCase() === joinField);
    });
}

// ---- contributions ---------------------------------------------------------

function buildContributionTargets(input: BuildFormCountPlanInput, suppressed: Set<string>): FormSectionCountTarget[] {
    const targets: FormSectionCountTarget[] = [];
    for (const contribution of input.Contributions) {
        const meta = contribution.Metadata;
        const whenEmpty = ResolveContributionWhenEmpty(meta.whenEmpty, input.Entity.Configuration);
        const showCount = ResolveContributionShowCount(meta.showCount, input.Entity.Configuration);
        if (!showCount) suppressed.add(contribution.SectionKey);
        if (!showCount && whenEmpty === 'show') continue;
        const params = contributionCountParams(meta, input.Record, input.Entity);
        targets.push({
            SectionKey: contribution.SectionKey,
            WhenEmpty: whenEmpty,
            ShowCount: showCount,
            Params: params ? countOnly(params) : null,
        });
    }
    return targets;
}

function contributionCountParams(meta: FormPanelRegistrationMetadata, record: BaseEntity, entity: EntityInfo): RunViewParams | null {
    if (meta.count === false) return null;
    const countEntity = meta.count ? meta.count.entity : meta.relatedEntity;
    if (!countEntity?.trim()) return null;
    const explicitFields = meta.count
        ? (meta.count.joinFields ?? []).map((f) => StripJoinFieldBrackets(f)).filter((f): f is string => !!f)
        : [StripJoinFieldBrackets(meta.relatedJoinField)].filter((f): f is string => !!f);
    const matches = relationshipsTo(entity, countEntity);
    if (explicitFields.length === 1) {
        const rel = matches.find((m) => StripJoinFieldBrackets(m.RelatedEntityJoinField)?.toLowerCase() === explicitFields[0].toLowerCase());
        if (rel) return EntityInfo.BuildRelationshipViewParams(record, rel);
    }
    if (explicitFields.length > 0) {
        return EntityInfo.BuildRelationshipViewParamsForJoinFields(record, countEntity, explicitFields);
    }
    if (matches.length === 1) return EntityInfo.BuildRelationshipViewParams(record, matches[0]);
    if (matches.length > 1) {
        // A claim without a join field covers every FK to that entity.
        return EntityInfo.BuildRelationshipViewParamsForJoinFields(record, countEntity, matches.map((m) => m.RelatedEntityJoinField));
    }
    return null;
}

function relationshipsTo(entity: EntityInfo, relatedEntityName: string): EntityRelationshipInfo[] {
    const wanted = relatedEntityName.trim().toLowerCase();
    return (entity.RelatedEntities ?? []).filter((r) => r.RelatedEntity.trim().toLowerCase() === wanted);
}

// ---- system badges ---------------------------------------------------------

function buildSystemTargets(input: BuildFormCountPlanInput): FormSystemCountTarget[] {
    const { Record: record, Entity: entity } = input;
    const entityID = EscapeSQLString(entity.ID);
    const recordValues = EscapeSQLString(record.PrimaryKey.Values());
    const targets: FormSystemCountTarget[] = [
        { Key: 'tags', Params: countOnly({ EntityName: TAGGED_ITEMS_ENTITY, ExtraFilter: `EntityID='${entityID}' AND RecordID='${recordValues}'` }) },
    ];
    if (input.IncludeAttachments) {
        targets.push({ Key: 'attachments', Params: countOnly({ EntityName: FILE_LINKS_ENTITY, ExtraFilter: `EntityID='${entityID}' AND RecordID='${recordValues}'` }) });
    }
    if (entity.TrackRecordChanges) {
        const recordKey = EscapeSQLString(record.PrimaryKey.ToConcatenatedString());
        targets.push({ Key: 'versions', Params: countOnly({ EntityName: RECORD_CHANGES_ENTITY, ExtraFilter: `EntityID='${entityID}' AND RecordID='${recordKey}'` }) });
    }
    return targets;
}

// ---- helpers ---------------------------------------------------------------

function countOnly(params: RunViewParams): RunViewParams {
    return { ...params, ResultType: 'count_only', MaxRows: undefined };
}

function readCount(result: RunViewResult | null | undefined): number | null {
    if (!result?.Success) return null;
    const count = Number(result.TotalRowCount ?? result.RowCount);
    return Number.isFinite(count) && count >= 0 ? count : null;
}

function dedupeByKey(targets: FormSectionCountTarget[]): FormSectionCountTarget[] {
    const seen = new Map<string, FormSectionCountTarget>();
    for (const target of targets) {
        // A contribution registered under the same key as a grid wins (it is
        // what renders there).
        seen.set(target.SectionKey, target);
    }
    return [...seen.values()];
}
