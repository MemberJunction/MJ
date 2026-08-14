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
 * NULL / `{}` / omitted keys = today's accordion. Related-role policy defaults
 * to `'smart'`: a budgeted ranker, not "everything in More".
 *
 * @see plans/form-chrome-policy.md
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
    SequenceBase: 100,
    PlatformSchema: -80,
} as const;

export const PLATFORM_SCHEMA_NAME = '__mj';

export type FormLayout = 'accordion' | 'left-nav' | 'auto';
export type RelatedRolePolicy = 'keep-all-primary' | 'smart';
export type FormRole = 'Primary' | 'Detail';

export interface IEntityConfiguration {
    UI?: IEntityUIConfiguration;
}

export interface IEntityUIConfiguration {
    Form?: IEntityFormConfiguration;
}

export interface IEntityFormConfiguration {
    /**
     * `'accordion'` — every first-class section is a collapsible panel (today).
     * `'left-nav'` — a left rail of section groups; the body shows one group.
     * `'auto'` — accordion until first-class section count reaches
     * {@link AutoLeftNavAt}, then left-nav.
     *
     * Omit to treat as `'auto'`.
     */
    Layout?: FormLayout;
    /** Threshold used when {@link Layout} is `'auto'` (or omitted). Default 8. */
    AutoLeftNavAt?: number;
    /**
     * How omitted `FormRole` on a relationship is resolved.
     * `'keep-all-primary'` — today's form (every DisplayInForm related is first-class).
     * `'smart'` — budgeted ranker (default).
     */
    RelatedRolePolicy?: RelatedRolePolicy;
    /**
     * Max untagged related grids that stay first-class when
     * {@link RelatedRolePolicy} is `'smart'`. Default 6. Does not cap
     * explicit `FormRole: 'Primary'` punches.
     */
    PrimaryRelatedBudget?: number;
}

export interface IEntityRelationshipConfiguration {
    UI?: IEntityRelationshipUIConfiguration;
}

export interface IEntityRelationshipUIConfiguration {
    /**
     * `'Primary'` — always first-class (can exceed the budget).
     * `'Detail'` — always parked in More.
     * Omit — the ranker decides (`RelatedRolePolicy`).
     */
    FormRole?: FormRole;
}

export type RelatedFormRoleReason =
    | 'explicit-primary'
    | 'explicit-detail'
    | 'ranked-primary'
    | 'ranked-detail'
    | 'keep-all-primary'
    | 'under-budget';

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
    Configuration?: string | null;
}

export interface RelatedFormRoleAssignment {
    RelationshipID: string;
    RelatedEntity: string;
    RelatedEntityJoinField: string;
    Role: FormRole;
    Score: number;
    Reason: RelatedFormRoleReason;
    ExplicitFormRole: FormRole | null;
}

export interface RelatedFormRoleResolution {
    Policy: RelatedRolePolicy;
    Budget: number;
    Assignments: RelatedFormRoleAssignment[];
}

export function ParseEntityConfiguration(raw: string | null | undefined): IEntityConfiguration | null {
    if (raw == null || raw.trim().length === 0) return null;
    return SafeJSONParse<IEntityConfiguration>(raw, false) ?? null;
}

export function ParseEntityRelationshipConfiguration(
    raw: string | null | undefined,
): IEntityRelationshipConfiguration | null {
    if (raw == null || raw.trim().length === 0) return null;
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
 * Score a DisplayInForm relationship for the smart ranker. Explicit FormRole
 * is not applied here — callers separate the punch-through pool first.
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
    score += sequenceBoost(candidate.Sequence);
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

    for (const candidate of visible) {
        const explicit = readExplicitFormRole(candidate.Configuration);
        const score = ScoreRelatedFormRole(candidate, parentSchemaName);
        if (explicit === 'Primary') {
            assignments.push(toAssignment(candidate, 'Primary', score, 'explicit-primary', explicit));
            continue;
        }
        if (explicit === 'Detail') {
            assignments.push(toAssignment(candidate, 'Detail', score, 'explicit-detail', explicit));
            continue;
        }
        untagged.push({ candidate, score });
    }

    if (policy === 'keep-all-primary') {
        for (const item of untagged) {
            assignments.push(toAssignment(item.candidate, 'Primary', item.score, 'keep-all-primary', null));
        }
        return { Policy: policy, Budget: budget, Assignments: sortAssignments(assignments) };
    }

    if (untagged.length <= budget) {
        for (const item of untagged) {
            assignments.push(toAssignment(item.candidate, 'Primary', item.score, 'under-budget', null));
        }
        return { Policy: policy, Budget: budget, Assignments: sortAssignments(assignments) };
    }

    const ranked = [...untagged].sort(compareUntagged);
    ranked.forEach((item, index) => {
        const isPrimary = index < budget;
        assignments.push(toAssignment(
            item.candidate,
            isPrimary ? 'Primary' : 'Detail',
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

function readExplicitFormRole(raw: string | null | undefined): FormRole | null {
    const parsed = ParseEntityRelationshipConfiguration(raw);
    const role = parsed?.UI?.FormRole;
    return role === 'Primary' || role === 'Detail' ? role : null;
}

function toAssignment(
    candidate: RelatedFormRoleCandidate,
    role: FormRole,
    score: number,
    reason: RelatedFormRoleReason,
    explicit: FormRole | null,
): RelatedFormRoleAssignment {
    return {
        RelationshipID: candidate.ID,
        RelatedEntity: candidate.RelatedEntity,
        RelatedEntityJoinField: candidate.RelatedEntityJoinField,
        Role: role,
        Score: score,
        Reason: reason,
        ExplicitFormRole: explicit,
    };
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

function sequenceBoost(sequence: number | null | undefined): number {
    const seq = effectiveSequence(sequence);
    return Math.max(0, RELATED_ROLE_SCORE.SequenceBase - seq);
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
