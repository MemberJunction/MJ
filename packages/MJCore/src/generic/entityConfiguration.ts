/**
 * Runtime view of `MJ: Entities.Configuration` and
 * `MJ: Entity Relationships.Configuration`.
 *
 * Keep this file in lockstep with:
 * - `metadata/entities/JSONType-interfaces/IEntityConfiguration.ts`
 * - `metadata/entities/JSONType-interfaces/IEntityRelationshipConfiguration.ts`
 *
 * Those files are CodeGen's source of truth (the generated
 * `MJEntityEntity_IEntityConfiguration` / ER counterpart). This file is what
 * `EntityInfo` / the form-chrome ranker consume — `@memberjunction/core` cannot
 * import the generated entity package.
 *
 * NULL / `{}` / omitted keys = accordion until AutoLeftNavAt, then left-nav.
 * Related-role policy defaults to `'smart'`: a budgeted ranker over Auto
 * leftovers. L1 `inclusion: 'None'` never enters the ranker.
 *
 * @see guides/FORMS_ARCHITECTURE_GUIDE.md §7d
 */
import { SafeJSONParse } from '@memberjunction/global';

export const DEFAULT_AUTO_LEFT_NAV_AT = 8;
export const DEFAULT_PRIMARY_RELATED_BUDGET = 6;

export const RELATED_ROLE_SCORE = {
    RelatedRecordCollection: 200,
    CustomDisplayComponent: 150,
    SameSchema: 100,
    OneToMany: 50,
    BeforeFieldTabs: 40,
    /**
     * Cap for the inbound-relationship hub boost. A related entity that many
     * other entities point at (Order Headers) outranks a satellite with two
     * incoming keys (Task Activities). Applied as `min(cap, 20 * log2(count))`.
     */
    InboundHubCap: 120,
    CreatedByJoin: -90,
    SatelliteName: -70,
    PlatformSchema: -80,
} as const;

export const PLATFORM_SCHEMA_NAME = '__mj';

export type FormLayout = 'accordion' | 'left-nav' | 'auto';
export type RelatedRolePolicy = 'keep-all-primary' | 'smart';
export type FormRole = 'Primary' | 'Detail';
/** L1 membership on a parent form. None never reaches the ranker. */
export type FormInclusion = 'Primary' | 'More' | 'None';

import {
    IEntityConfiguration,
    IEntityUIConfiguration,
    IEntityFormConfiguration
} from './JSONType-interfaces/IEntityConfiguration';
import {
    IEntityFieldConfiguration,
    IEntityFieldHierarchyConfig
} from './JSONType-interfaces/IEntityFieldConfiguration';
import {
    IEntityRelationshipConfiguration,
    IEntityRelationshipUIConfiguration
} from './JSONType-interfaces/IEntityRelationshipConfiguration';

export * from './JSONType-interfaces/IEntityConfiguration';
export * from './JSONType-interfaces/IEntityFieldConfiguration';
export * from './JSONType-interfaces/IEntityRelationshipConfiguration';

export interface IEntityRelationshipJoin {
    mode: 'any';
    fields: string[];
}

export type RelatedFormRoleReason =
    | 'explicit-primary'
    | 'explicit-detail'
    | 'explicit-none'
    | 'join-sibling-none'
    | 'ranked-primary'
    | 'ranked-detail'
    | 'keep-all-primary'
    | 'under-budget'
    | 'install-primary'
    | 'install-more'
    | 'install-none';

export type FormChromeRuleTargetKind = 'Relationship' | 'Contribution';

/**
 * One install-overlay (L3) pin. Loaded from `MJ: Form Chrome Rules`.
 * Keyed by (parent entity, related entity) or (parent entity, contributionKey).
 */
export interface FormChromeRule {
    EntityID: string;
    TargetKind: FormChromeRuleTargetKind;
    RelatedEntityID?: string | null;
    ContributionKey?: string | null;
    Inclusion: FormInclusion;
    JoinFields?: string[] | null;
    Sequence?: number | null;
    /**
     * Admin display title. Null / blank keeps the L1 DisplayName or
     * humanized entity name. Keyed with the rule, not the previous label,
     * so an OpenApp upgrade that renames the related entity does not
     * overwrite a site-specific title.
     */
    Title?: string | null;
}

export interface RelatedFormRoleCandidate {
    ID: string;
    RelatedEntity: string;
    RelatedEntityID: string;
    RelatedEntityJoinField: string;
    RelatedEntitySchemaName: string;
    DisplayInForm: boolean;
    DisplayLocation?: 'After Field Tabs' | 'Before Field Tabs' | null;
    DisplayComponentID?: string | null;
    RelatedRecordCollection?: string | null;
    JoinView?: string | null;
    Type?: string | null;
    Sequence?: number | null;
    /**
     * Either shape is accepted, matching the readers below
     * ({@link ReadRelationshipInclusion}, {@link ReadRelationshipSortKey},
     * {@link ReadRelationshipJoinFields}): a candidate built from an
     * `EntityRelationshipInfo` carries the parsed object its `Configuration`
     * getter returns, while one built straight from a metadata row carries the
     * raw JSON string.
     */
    Configuration?: string | IEntityRelationshipConfiguration | null;
    /**
     * How many EntityRelationships across metadata point at this related
     * entity. Runtime-only — the ranker uses it as graph in-degree.
     */
    InboundRelationshipCount?: number | null;
}

export interface RelatedFormRoleAssignment {
    RelationshipID: string;
    RelatedEntity: string;
    RelatedEntityID: string;
    RelatedEntityJoinField: string;
    Role: FormRole;
    Inclusion: FormInclusion;
    Score: number;
    Reason: RelatedFormRoleReason;
    ExplicitFormRole: FormRole | null;
    ExplicitInclusion: FormInclusion | null;
    JoinFields: string[] | null;
}

export interface RelatedFormRoleResolution {
    Policy: RelatedRolePolicy;
    Budget: number;
    Assignments: RelatedFormRoleAssignment[];
}

export function ParseEntityConfiguration(raw: string | IEntityConfiguration | null | undefined): IEntityConfiguration | null {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || raw.trim().length === 0) return null;
    return SafeJSONParse<IEntityConfiguration>(raw, false) ?? null;
}

export function ParseEntityRelationshipConfiguration(
    raw: string | IEntityRelationshipConfiguration | null | undefined,
): IEntityRelationshipConfiguration | null {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || raw.trim().length === 0) return null;
    return SafeJSONParse<IEntityRelationshipConfiguration>(raw, false) ?? null;
}

export function ResolveFormLayout(
    formConfig: IEntityFormConfiguration | null | undefined,
    firstClassSectionCount: number,
): Exclude<FormLayout, 'auto'> {
    const layout = formConfig?.Layout ?? 'auto';
    if (layout === 'accordion' || layout === 'left-nav') return layout;
    const threshold = formConfig?.AutoLeftNavAt ?? DEFAULT_AUTO_LEFT_NAV_AT;
    return firstClassSectionCount >= threshold ? 'left-nav' : 'accordion';
}

/**
 * Read L1 inclusion from a relationship Configuration bag.
 * `inclusion` wins. `FormRole: 'Detail'` maps to More. `FormRole: 'Primary'` maps to Primary.
 */
export function ReadRelationshipInclusion(raw: string | IEntityRelationshipConfiguration | null | undefined): FormInclusion | null {
    const parsed = ParseEntityRelationshipConfiguration(raw);
    const ui = parsed?.UI;
    if (ui?.inclusion === 'Primary' || ui?.inclusion === 'More' || ui?.inclusion === 'None') {
        return ui.inclusion;
    }
    if (ui?.FormRole === 'Primary') return 'Primary';
    if (ui?.FormRole === 'Detail') return 'More';
    return null;
}

/** Higher = earlier among first-class related rail items. Omit / invalid = null. */
export function ReadRelationshipSortKey(raw: string | IEntityRelationshipConfiguration | null | undefined): number | null {
    const sort = ParseEntityRelationshipConfiguration(raw)?.UI?.sortKey;
    if (typeof sort !== 'number' || !Number.isFinite(sort)) return null;
    return sort;
}

export function ReadRelationshipJoinFields(raw: string | IEntityRelationshipConfiguration | null | undefined): string[] | null {
    const fields = ParseEntityRelationshipConfiguration(raw)?.UI?.join?.fields;
    if (!fields || fields.length === 0) return null;
    const cleaned = fields.map((f) => f.trim()).filter((f) => f.length > 0);
    return cleaned.length > 0 ? cleaned : null;
}

/**
 * Score a DisplayInForm relationship for the smart ranker. Explicit inclusion
 * is not applied here — callers separate the L1 pool first.
 */
export function ScoreRelatedFormRole(
    candidate: RelatedFormRoleCandidate,
    parentSchemaName: string,
): number {
    let score = 0;
    if (hasText(candidate.RelatedRecordCollection)) {
        score += RELATED_ROLE_SCORE.RelatedRecordCollection;
    }
    if (hasText(candidate.DisplayComponentID)) {
        score += RELATED_ROLE_SCORE.CustomDisplayComponent;
    }
    if (schemasEqual(candidate.RelatedEntitySchemaName, parentSchemaName)) {
        score += RELATED_ROLE_SCORE.SameSchema;
    }
    if (isOneToMany(candidate)) {
        score += RELATED_ROLE_SCORE.OneToMany;
    }
    if (candidate.DisplayLocation === 'Before Field Tabs') {
        score += RELATED_ROLE_SCORE.BeforeFieldTabs;
    }
    score += inboundHubBoost(candidate.InboundRelationshipCount);
    score += createdByJoinPenalty(candidate.RelatedEntityJoinField);
    score += satelliteNamePenalty(candidate.RelatedEntity);
    if (isPlatformSchema(candidate.RelatedEntitySchemaName) && !isPlatformSchema(parentSchemaName)) {
        score += RELATED_ROLE_SCORE.PlatformSchema;
    }
    return score;
}

export function ResolveRelatedFormRoles(
    parentSchemaName: string,
    formConfig: IEntityFormConfiguration | null | undefined,
    candidates: readonly RelatedFormRoleCandidate[],
): RelatedFormRoleResolution {
    const policy: RelatedRolePolicy = formConfig?.RelatedRolePolicy ?? 'smart';
    const budget = resolveBudget(formConfig?.PrimaryRelatedBudget);
    const visible = candidates.filter((c) => c.DisplayInForm);

    const assignments: RelatedFormRoleAssignment[] = [];
    const untagged: { candidate: RelatedFormRoleCandidate; score: number }[] = [];
    const joinSiblingNone = impliedJoinSiblingNoneIds(visible);

    for (const candidate of visible) {
        const explicit = ReadRelationshipInclusion(candidate.Configuration);
        const inclusion = explicit ?? (joinSiblingNone.has(candidate.ID) ? 'None' : null);
        const score = ScoreRelatedFormRole(candidate, parentSchemaName);
        if (inclusion === 'None') {
            const reason: RelatedFormRoleReason = explicit === 'None' ? 'explicit-none' : 'join-sibling-none';
            assignments.push(toAssignment(candidate, 'Detail', 'None', score, reason, explicit));
            continue;
        }
        if (inclusion === 'Primary') {
            assignments.push(toAssignment(candidate, 'Primary', 'Primary', score, 'explicit-primary', inclusion));
            continue;
        }
        if (inclusion === 'More') {
            assignments.push(toAssignment(candidate, 'Detail', 'More', score, 'explicit-detail', inclusion));
            continue;
        }
        untagged.push({ candidate, score });
    }

    if (policy === 'keep-all-primary') {
        for (const item of untagged) {
            assignments.push(toAssignment(item.candidate, 'Primary', 'Primary', item.score, 'keep-all-primary', null));
        }
        return { Policy: policy, Budget: budget, Assignments: sortAssignments(assignments) };
    }

    if (untagged.length <= budget) {
        for (const item of untagged) {
            assignments.push(toAssignment(item.candidate, 'Primary', 'Primary', item.score, 'under-budget', null));
        }
        return { Policy: policy, Budget: budget, Assignments: sortAssignments(assignments) };
    }

    const ranked = [...untagged].sort(compareUntagged);
    ranked.forEach((item, index) => {
        const isPrimary = index < budget;
        assignments.push(toAssignment(
            item.candidate,
            isPrimary ? 'Primary' : 'Detail',
            isPrimary ? 'Primary' : 'More',
            item.score,
            isPrimary ? 'ranked-primary' : 'ranked-detail',
            null,
        ));
    });

    return { Policy: policy, Budget: budget, Assignments: sortAssignments(assignments) };
}

function resolveBudget(raw: number | undefined): number {
    if (raw == null || !Number.isFinite(raw)) return DEFAULT_PRIMARY_RELATED_BUDGET;
    return Math.max(0, Math.floor(raw));
}

function toAssignment(
    candidate: RelatedFormRoleCandidate,
    role: FormRole,
    inclusion: FormInclusion,
    score: number,
    reason: RelatedFormRoleReason,
    explicitInclusion: FormInclusion | null,
): RelatedFormRoleAssignment {
    const explicitRole: FormRole | null =
        explicitInclusion === 'Primary' ? 'Primary'
        : explicitInclusion === 'More' ? 'Detail'
        : null;
    return {
        RelationshipID: candidate.ID,
        RelatedEntity: candidate.RelatedEntity,
        RelatedEntityID: candidate.RelatedEntityID,
        RelatedEntityJoinField: candidate.RelatedEntityJoinField,
        Role: role,
        Inclusion: inclusion,
        Score: score,
        Reason: reason,
        ExplicitFormRole: explicitRole,
        ExplicitInclusion: explicitInclusion,
        JoinFields: ReadRelationshipJoinFields(candidate.Configuration),
    };
}

/**
 * When one relationship to a related entity carries `join.fields`, sibling
 * FKs to that same entity with no explicit inclusion are not candidates.
 */
function impliedJoinSiblingNoneIds(candidates: readonly RelatedFormRoleCandidate[]): Set<string> {
    const ownerKeys = new Set<string>();
    for (const candidate of candidates) {
        if (ReadRelationshipJoinFields(candidate.Configuration)) {
            ownerKeys.add(relatedEntityKey(candidate));
        }
    }
    const noneIds = new Set<string>();
    if (ownerKeys.size === 0) return noneIds;
    for (const candidate of candidates) {
        if (!ownerKeys.has(relatedEntityKey(candidate))) continue;
        if (ReadRelationshipInclusion(candidate.Configuration) != null) continue;
        if (ReadRelationshipJoinFields(candidate.Configuration)) continue;
        noneIds.add(candidate.ID);
    }
    return noneIds;
}

function relatedEntityKey(candidate: RelatedFormRoleCandidate): string {
    const id = (candidate.RelatedEntityID ?? '').trim().toLowerCase();
    if (id.length > 0) return id;
    return (candidate.RelatedEntity ?? '').trim().toLowerCase();
}

/**
 * L3 install overlay. Pins Inclusion / JoinFields on matching relationship
 * assignments. Later Sequence wins. Contribution rules are applied by the
 * chrome resolver (they are not ranker assignments).
 */
export function ApplyFormChromeRules(
    parentEntityId: string,
    assignments: readonly RelatedFormRoleAssignment[],
    rules: readonly FormChromeRule[],
): RelatedFormRoleAssignment[] {
    const parent = parentEntityId.trim().toLowerCase();
    if (parent.length === 0 || rules.length === 0) return [...assignments];
    const applicable = rules
        .filter((rule) => rule.TargetKind === 'Relationship' && idsEqual(rule.EntityID, parent))
        .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0));
    if (applicable.length === 0) return [...assignments];

    return assignments.map((assignment) => {
        const rule = lastMatchingRelationshipRule(applicable, assignment);
        return rule ? applyRelationshipRule(assignment, rule) : assignment;
    });
}

export function ContributionInclusionFromRules(
    parentEntityId: string,
    contributionKey: string,
    rules: readonly FormChromeRule[],
): FormInclusion | null {
    const parent = parentEntityId.trim().toLowerCase();
    const key = contributionKey.trim().toLowerCase();
    if (parent.length === 0 || key.length === 0) return null;
    const matches = rules
        .filter((rule) =>
            rule.TargetKind === 'Contribution'
            && idsEqual(rule.EntityID, parent)
            && (rule.ContributionKey ?? '').trim().toLowerCase() === key,
        )
        .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0));
    return matches.at(-1)?.Inclusion ?? null;
}

function lastMatchingRelationshipRule(
    rules: readonly FormChromeRule[],
    assignment: RelatedFormRoleAssignment,
): FormChromeRule | undefined {
    const matches = rules.filter((rule) =>
        idsEqual(rule.RelatedEntityID, assignment.RelatedEntityID),
    );
    return matches.at(-1);
}

function applyRelationshipRule(
    assignment: RelatedFormRoleAssignment,
    rule: FormChromeRule,
): RelatedFormRoleAssignment {
    const inclusion = rule.Inclusion;
    const role: FormRole = inclusion === 'Primary' ? 'Primary' : 'Detail';
    const reason: RelatedFormRoleReason =
        inclusion === 'Primary' ? 'install-primary'
        : inclusion === 'More' ? 'install-more'
        : 'install-none';
    const join = rule.JoinFields && rule.JoinFields.length > 0
        ? rule.JoinFields
        : assignment.JoinFields;
    return { ...assignment, Role: role, Inclusion: inclusion, Reason: reason, JoinFields: join };
}

function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
        && (a ?? '').trim().length > 0;
}

function sortAssignments(assignments: RelatedFormRoleAssignment[]): RelatedFormRoleAssignment[] {
    return [...assignments].sort((a, b) => {
        if (b.Score !== a.Score) return b.Score - a.Score;
        return a.RelatedEntity.localeCompare(b.RelatedEntity);
    });
}

function compareUntagged(
    a: { candidate: RelatedFormRoleCandidate; score: number },
    b: { candidate: RelatedFormRoleCandidate; score: number },
): number {
    if (b.score !== a.score) return b.score - a.score;
    const aSeq = effectiveSequence(a.candidate.Sequence);
    const bSeq = effectiveSequence(b.candidate.Sequence);
    if (aSeq !== bSeq) return aSeq - bSeq;
    return a.candidate.RelatedEntity.localeCompare(b.candidate.RelatedEntity);
}

function isOneToMany(candidate: RelatedFormRoleCandidate): boolean {
    if (hasText(candidate.JoinView)) return false;
    const type = (candidate.Type ?? '').trim().toUpperCase();
    if (type.length === 0) return true;
    return type === 'ONE TO MANY';
}

function inboundHubBoost(count: number | null | undefined): number {
    if (count == null || count <= 2) return 0;
    return Math.min(
        RELATED_ROLE_SCORE.InboundHubCap,
        Math.round(20 * Math.log2(count)),
    );
}

function createdByJoinPenalty(joinField: string | null | undefined): number {
    const field = (joinField ?? '').trim();
    if (/^(CreatedBy|UpdatedBy|DeletedBy|OwnedBy)/i.test(field)) {
        return RELATED_ROLE_SCORE.CreatedByJoin;
    }
    return 0;
}

function satelliteNamePenalty(relatedEntity: string | null | undefined): number {
    const name = (relatedEntity ?? '').toLowerCase();
    if (/(activit|comment|log|notification|exemption|intent|assignment|dependenc|decision|tag link|stored value|payment method|entitlement|promotion code)/.test(name)) {
        return RELATED_ROLE_SCORE.SatelliteName;
    }
    return 0;
}

function effectiveSequence(sequence: number | null | undefined): number {
    if (sequence == null || sequence === 0) return 999;
    return sequence;
}

function isPlatformSchema(schemaName: string | null | undefined): boolean {
    return (schemaName ?? '').trim().toLowerCase() === PLATFORM_SCHEMA_NAME;
}

function schemasEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
        && (a ?? '').trim().length > 0;
}

function hasText(value: string | null | undefined): boolean {
    return value != null && value.trim().length > 0;
}

/**
 * Safely parses an `EntityField.Configuration` JSON string or returns the object.
 */
export function ParseEntityFieldConfiguration(raw: string | IEntityFieldConfiguration | null | undefined): IEntityFieldConfiguration | null {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || raw.trim().length === 0) return null;
    return SafeJSONParse<IEntityFieldConfiguration>(raw, false) ?? null;
}

