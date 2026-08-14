import {
    EntityInfo,
    EntityRelationshipInfo,
    ResolveFormLayout,
    ResolveRelatedFormRoles,
    type FormRole,
    type IEntityFormConfiguration,
    type RelatedFormRoleAssignment,
    type RelatedFormRoleCandidate,
    type RelatedFormRoleResolution,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { RelatedEntitySectionKey } from '../panel-slot/form-contribution';
import { BaseFormPolicy, type FormChromeContext } from './base-form-policy';
import {
    DETAILS_SECTION_KEY,
    MORE_SECTION_KEY,
    HumanizeEntityTitle,
    IsAlwaysMoreSection,
    type FormChromeGroup,
    type FormChromePanelSnapshot,
    type FormChromeSpec,
} from './form-chrome';

/** User override of which sections live in More vs first-class. */
export interface ChromeMembershipOverride {
    moreSectionKeys?: readonly string[];
    firstClassSectionKeys?: readonly string[];
}

export interface ResolveFormChromeInput {
    Entity: EntityInfo;
    Panels: FormChromePanelSnapshot[];
    /** Related-entity schema by entity ID. Built from the active provider. */
    RelatedSchemaByEntityId: ReadonlyMap<string, string>;
    /**
     * Section keys a contribution claimed or replaced. Must not appear in
     * the rail — otherwise a custom Contact Methods widget and the baked
     * grid merge into one group and both show.
     */
    HiddenSectionKeys?: readonly string[];
    /** Persisted user move-in / move-out of More. */
    Membership?: ChromeMembershipOverride | null;
    /**
     * RelatedEntityID (lowercase) → how many EntityRelationships point at
     * that entity. Used as graph in-degree by the smart ranker.
     */
    InboundRelationshipCountByEntityId?: ReadonlyMap<string, number>;
    /**
     * Section keys of registered form contributions (custom widgets). These
     * stay first-class instead of folding into Details, and rank above
     * stock related grids.
     */
    ContributionSectionKeys?: readonly string[];
    /** contribution SectionKey → details | more. Overrides first-class lift. */
    ContributionChromeGroupByKey?: ReadonlyMap<string, 'details' | 'more'>;
}

export interface ResolveFormChromeResult {
    Spec: FormChromeSpec;
    RelatedRoles: RelatedFormRoleResolution;
    PolicyUsed: boolean;
}

/**
 * Last-wins `BaseFormPolicy` for this entity, or `null` when none is registered.
 */
export function ResolveFormPolicy(entityName: string): BaseFormPolicy | null {
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
        BaseFormPolicy,
        (metadata) => {
            if (!metadata) return false;
            const entity = (metadata as { entity?: unknown }).entity;
            return typeof entity === 'string' && entity === entityName;
        },
    );
    if (registrations.length === 0) return null;
    const winner = [...registrations].sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0)).at(-1);
    if (!winner?.SubClass) return null;
    const Ctor = winner.SubClass as new () => BaseFormPolicy;
    return new Ctor();
}

export function BuildRelatedFormRoleCandidates(
    entity: EntityInfo,
    relatedSchemaByEntityId: ReadonlyMap<string, string>,
    inboundCountByRelatedEntityId: ReadonlyMap<string, number> = new Map(),
): RelatedFormRoleCandidate[] {
    return entity.RelatedEntities.map((rel) =>
        toCandidate(rel, relatedSchemaByEntityId, inboundCountByRelatedEntityId),
    );
}

export function ResolveFormChrome(input: ResolveFormChromeInput): ResolveFormChromeResult {
    const formConfig = input.Entity.ConfigurationObject?.UI?.Form ?? null;
    const resolution = ResolveRelatedFormRoles(
        input.Entity.SchemaName,
        formConfig,
        BuildRelatedFormRoleCandidates(
            input.Entity,
            input.RelatedSchemaByEntityId,
            input.InboundRelationshipCountByEntityId,
        ),
    );

    const relatedRoles = mapRelatedRoles(input.Entity, resolution.Assignments);
    const hidden = new Set(input.HiddenSectionKeys ?? []);
    for (const key of displayInFormFalseSectionKeys(input.Entity)) hidden.add(key);
    const visiblePanels = input.Panels.filter((p) => !hidden.has(p.SectionKey));
    const defaultSpec = BuildDefaultChromeSpec(
        visiblePanels,
        relatedRoles,
        formConfig,
        input.ContributionSectionKeys,
        input.ContributionChromeGroupByKey,
    );
    addMissingRelatedGroups(defaultSpec, input.Entity, relatedRoles, hidden);
    applyRelatedDisplayNames(defaultSpec, input.Entity);
    mergeRelatedGroupsByEntity(defaultSpec, input.Entity);
    sortFirstClassRelatedGroups(
        defaultSpec,
        input.Entity,
        resolution.Assignments,
        input.ContributionSectionKeys,
    );
    ApplyUserChromeMembership(defaultSpec, input.Membership, visiblePanels);

    const policy = ResolveFormPolicy(input.Entity.Name);
    if (policy) {
        const ctx: FormChromeContext = {
            Entity: input.Entity,
            RelatedRoles: resolution,
            Panels: input.Panels,
            PrimarySectionCount: countFirstClass(defaultSpec),
        };
        const override = policy.ResolveChrome(ctx);
        if (override) {
            ApplyUserChromeMembership(override, input.Membership, visiblePanels);
            return { Spec: override, RelatedRoles: resolution, PolicyUsed: true };
        }
    }

    return { Spec: defaultSpec, RelatedRoles: resolution, PolicyUsed: false };
}

export function BuildDefaultChromeSpec(
    panels: FormChromePanelSnapshot[],
    relatedRoles: ReadonlyMap<string, FormRole>,
    formConfig: IEntityFormConfiguration | null,
    contributionSectionKeys: readonly string[] = [],
    contributionChromeGroupByKey: ReadonlyMap<string, 'details' | 'more'> = new Map(),
): FormChromeSpec {
    const moreKeys: string[] = [];
    const fieldKeys: string[] = [];
    const relatedGroups: FormChromeGroup[] = [];
    const contributions = new Set(contributionSectionKeys);

    for (const panel of panels) {
        if (!panel.SectionKey) continue;
        if (IsAlwaysMoreSection(panel.SectionKey, panel.SectionName)) {
            moreKeys.push(panel.SectionKey);
            continue;
        }
        const pinned = contributionChromeGroupByKey.get(panel.SectionKey);
        if (pinned === 'details') {
            fieldKeys.push(panel.SectionKey);
            continue;
        }
        if (pinned === 'more') {
            moreKeys.push(panel.SectionKey);
            continue;
        }
        if (panel.Variant === 'related-entity' || contributions.has(panel.SectionKey)) {
            if (relatedRoles.get(panel.SectionKey) === 'Detail') {
                moreKeys.push(panel.SectionKey);
                continue;
            }
            relatedGroups.push(relatedGroupFromPanel(panel));
            continue;
        }
        fieldKeys.push(panel.SectionKey);
    }

    const groups: FormChromeGroup[] = [];
    if (fieldKeys.length > 0) {
        const firstField = panels.find((p) => p.SectionKey === fieldKeys[0]);
        groups.push({
            Key: DETAILS_SECTION_KEY,
            Title: 'Details',
            Icon: firstField?.Icon?.trim() || 'fa-solid fa-id-card',
            SectionKeys: fieldKeys,
            IsMore: false,
        });
    }
    groups.push(...MergeChromeGroupsByTitle(relatedGroups));
    appendMoreGroup(groups, moreKeys);

    const layout = ResolveFormLayout(formConfig, groups.length);
    return {
        Layout: layout,
        Groups: groups,
        RelatedRoles: relatedRoles,
        MoreSectionKeys: moreKeys,
    };
}

function relatedRailIcon(rel: EntityRelationshipInfo): string {
    if (rel.DisplayIconType === 'Custom' && rel.DisplayIcon?.trim()) {
        return rel.DisplayIcon.trim();
    }
    if (rel.DisplayIcon?.trim()) return rel.DisplayIcon.trim();
    return 'fa-solid fa-table';
}

function relatedGroupFromPanel(panel: FormChromePanelSnapshot): FormChromeGroup {
    return {
        Key: panel.SectionKey,
        Title: HumanizeEntityTitle(panel.SectionName || panel.SectionKey),
        Icon: panel.Icon?.trim() || 'fa-solid fa-table',
        SectionKeys: [panel.SectionKey],
        IsMore: false,
    };
}

/** First SectionKey index in a user order; used to sort rail groups. */
export function ChromeGroupOrderIndex(group: FormChromeGroup, sectionOrder: readonly string[]): number {
    let min = Number.MAX_SAFE_INTEGER;
    for (const key of group.SectionKeys) {
        const index = sectionOrder.indexOf(key);
        if (index >= 0 && index < min) min = index;
    }
    return min;
}

/** Reorder More children from a persisted section-key order. */
export function OrderMoreSectionKeys(
    moreKeys: readonly string[],
    sectionOrder: readonly string[],
): string[] {
    if (sectionOrder.length === 0) return [...moreKeys];
    return [...moreKeys].sort((a, b) => {
        const ai = sectionOrder.indexOf(a);
        const bi = sectionOrder.indexOf(b);
        const av = ai < 0 ? Number.MAX_SAFE_INTEGER : ai;
        const bv = bi < 0 ? Number.MAX_SAFE_INTEGER : bi;
        return av - bv;
    });
}

/** Reorder first-class rail groups from a persisted section-key order. More stays last. */
export function OrderChromeGroups(
    groups: readonly FormChromeGroup[],
    sectionOrder: readonly string[],
): FormChromeGroup[] {
    if (sectionOrder.length === 0) return [...groups];
    const more = groups.filter((g) => g.IsMore);
    const rest = groups.filter((g) => !g.IsMore);
    rest.sort((a, b) => {
        const ai = ChromeGroupOrderIndex(a, sectionOrder);
        const bi = ChromeGroupOrderIndex(b, sectionOrder);
        return ai - bi;
    });
    return [...rest, ...more];
}

/**
 * Move every SectionKey of `dragged` as a block in front of `target`
 * inside a section-order list. Used by left-nav rail drag/drop.
 */
export function MoveChromeGroupInSectionOrder(
    sectionOrder: readonly string[],
    dragged: FormChromeGroup,
    target: FormChromeGroup,
): string[] {
    const draggedKeys = new Set(dragged.SectionKeys);
    const without = sectionOrder.filter((key) => !draggedKeys.has(key));
    const insertAt = without.findIndex((key) => target.SectionKeys.includes(key));
    const next = [...without];
    const at = insertAt >= 0 ? insertAt : next.length;
    next.splice(at, 0, ...dragged.SectionKeys);
    return next;
}

/** Collapse rail items that share a humanized title (From/To Relationships). */
export function MergeChromeGroupsByTitle(groups: FormChromeGroup[]): FormChromeGroup[] {
    const merged: FormChromeGroup[] = [];
    const byTitle = new Map<string, FormChromeGroup>();
    for (const group of groups) {
        const titleKey = group.Title.trim().toLowerCase();
        const existing = byTitle.get(titleKey);
        if (!existing) {
            const copy: FormChromeGroup = { ...group, SectionKeys: [...group.SectionKeys] };
            byTitle.set(titleKey, copy);
            merged.push(copy);
            continue;
        }
        for (const key of group.SectionKeys) {
            if (!existing.SectionKeys.includes(key)) {
                existing.SectionKeys.push(key);
            }
        }
    }
    return merged;
}

/**
 * Apply a persisted user membership (move in/out of More) onto a spec
 * in place. Always-more sections (System Metadata) cannot leave More.
 */
export function ApplyUserChromeMembership(
    spec: FormChromeSpec,
    override: ChromeMembershipOverride | null | undefined,
    panels: readonly FormChromePanelSnapshot[] = [],
): FormChromeSpec {
    if (!override) return spec;
    const userMore = override.moreSectionKeys ?? [];
    const userFirst = override.firstClassSectionKeys ?? [];
    if (userMore.length === 0 && userFirst.length === 0) return spec;

    const more = new Set(spec.MoreSectionKeys);
    for (const key of userMore) {
        if (key) more.add(key);
    }
    const panelByKey = new Map(panels.map((p) => [p.SectionKey, p]));
    for (const key of userFirst) {
        if (!key) continue;
        const panel = panelByKey.get(key);
        if (!IsAlwaysMoreSection(key, panel?.SectionName)) {
            more.delete(key);
        }
    }
    for (const panel of panels) {
        if (IsAlwaysMoreSection(panel.SectionKey, panel.SectionName)) {
            more.add(panel.SectionKey);
        }
    }
    for (const key of spec.MoreSectionKeys) {
        if (IsAlwaysMoreSection(key)) more.add(key);
    }

    return RebuildChromeSpecMembership(spec, [...more], panels);
}

/** Rebuild Groups / MoreSectionKeys after membership changes. Layout is unchanged. */
export function RebuildChromeSpecMembership(
    spec: FormChromeSpec,
    moreKeys: readonly string[],
    panels: readonly FormChromePanelSnapshot[] = [],
): FormChromeSpec {
    const moreSet = new Set(moreKeys);
    const panelByKey = new Map(panels.map((p) => [p.SectionKey, p]));
    const groups: FormChromeGroup[] = [];

    for (const group of spec.Groups) {
        if (group.IsMore) continue;
        const stay = group.SectionKeys.filter((key) => !moreSet.has(key));
        if (stay.length === 0) continue;
        groups.push({ ...group, SectionKeys: stay });
    }

    const firstClass = new Set(groups.flatMap((g) => g.SectionKeys));
    const allKnown = new Set<string>([
        ...spec.Groups.flatMap((g) => g.SectionKeys),
        ...spec.MoreSectionKeys,
        ...moreKeys,
    ]);
    for (const key of allKnown) {
        if (!key || moreSet.has(key) || firstClass.has(key)) continue;
        const panel = panelByKey.get(key);
        groups.push({
            Key: key,
            Title: HumanizeEntityTitle(panel?.SectionName || key),
            Icon: panel?.Icon?.trim() || 'fa-solid fa-table',
            SectionKeys: [key],
            IsMore: false,
        });
        firstClass.add(key);
    }

    appendMoreGroup(groups, [...moreSet]);
    spec.Groups = groups;
    spec.MoreSectionKeys = [...moreSet];
    return spec;
}

/** Prefer EntityRelationship.DisplayName on single-key related groups. */
function applyRelatedDisplayNames(spec: FormChromeSpec, entity: EntityInfo): void {
    const displayInForm = entity.RelatedEntities.filter((rel) => rel.DisplayInForm);
    for (const rel of displayInForm) {
        const name = rel.DisplayName?.trim();
        if (!name) continue;
        const sectionKey = RelatedEntitySectionKey(rel, displayInForm);
        const group = spec.Groups.find((g) => !g.IsMore && g.SectionKeys.length === 1 && g.SectionKeys[0] === sectionKey);
        if (group) group.Title = name;
    }
}

function appendMoreGroup(groups: FormChromeGroup[], moreKeys: string[]): void {
    if (moreKeys.length === 0) return;
    const existing = groups.find((g) => g.IsMore);
    if (existing) {
        existing.SectionKeys = moreKeys;
        return;
    }
    groups.push({
        Key: MORE_SECTION_KEY,
        Title: 'More',
        Icon: 'fa-solid fa-ellipsis',
        SectionKeys: moreKeys,
        IsMore: true,
    });
}

function mapRelatedRoles(
    entity: EntityInfo,
    assignments: readonly RelatedFormRoleAssignment[],
): Map<string, FormRole> {
    const displayInForm = entity.RelatedEntities.filter((rel) => rel.DisplayInForm);
    const byId = new Map(assignments.map((a) => [a.RelationshipID.toLowerCase(), a]));
    const roles = new Map<string, FormRole>();
    for (const rel of displayInForm) {
        const assignment = byId.get((rel.ID ?? '').toLowerCase());
        if (!assignment) continue;
        const sectionKey = RelatedEntitySectionKey(rel, displayInForm);
        roles.set(sectionKey, assignment.Role);
    }
    return roles;
}

function toCandidate(
    rel: EntityRelationshipInfo,
    relatedSchemaByEntityId: ReadonlyMap<string, string>,
    inboundCountByRelatedEntityId: ReadonlyMap<string, number> = new Map(),
): RelatedFormRoleCandidate {
    const relatedId = rel.RelatedEntityID ?? '';
    const schema = relatedSchemaByEntityId.get(relatedId.toLowerCase())
        ?? relatedSchemaByEntityId.get(relatedId)
        ?? '';
    const inbound = inboundCountByRelatedEntityId.get(relatedId.toLowerCase())
        ?? inboundCountByRelatedEntityId.get(relatedId);
    return {
        ID: rel.ID,
        RelatedEntity: rel.RelatedEntity,
        RelatedEntityID: rel.RelatedEntityID,
        RelatedEntityJoinField: rel.RelatedEntityJoinField,
        RelatedEntitySchemaName: schema,
        DisplayInForm: rel.DisplayInForm,
        DisplayLocation: rel.DisplayLocation,
        DisplayComponentID: rel.DisplayComponentID,
        RelatedRecordCollection: rel.RelatedRecordCollection,
        JoinView: rel.JoinView,
        Type: rel.Type,
        Sequence: rel.Sequence,
        Configuration: rel.Configuration,
        InboundRelationshipCount: inbound,
    };
}

/** First-class related rail items: explicit Primary first, then ranker score. */
function sortFirstClassRelatedGroups(
    spec: FormChromeSpec,
    entity: EntityInfo,
    assignments: readonly RelatedFormRoleAssignment[],
    contributionSectionKeys: readonly string[] = [],
): void {
    const displayInForm = entity.RelatedEntities.filter((rel) => rel.DisplayInForm);
    const byId = new Map(assignments.map((a) => [a.RelationshipID.toLowerCase(), a]));
    const scoreByKey = new Map<string, number>();
    const explicitPrimary = new Set<string>();
    const contrib = new Set(contributionSectionKeys);
    for (const rel of displayInForm) {
        const assignment = byId.get((rel.ID ?? '').toLowerCase());
        if (!assignment) continue;
        const key = RelatedEntitySectionKey(rel, displayInForm);
        const current = scoreByKey.get(key);
        scoreByKey.set(key, current == null ? assignment.Score : Math.max(current, assignment.Score));
        if (assignment.Reason === 'explicit-primary') explicitPrimary.add(key);
    }
    for (const key of contrib) {
        scoreByKey.set(key, (scoreByKey.get(key) ?? 0) + 150);
    }

    const details = spec.Groups.filter((g) => g.Key === DETAILS_SECTION_KEY);
    const more = spec.Groups.filter((g) => g.IsMore);
    const related = spec.Groups.filter((g) => !g.IsMore && g.Key !== DETAILS_SECTION_KEY);
    related.sort((a, b) => {
        const aExplicit = a.SectionKeys.some((key) => explicitPrimary.has(key));
        const bExplicit = b.SectionKeys.some((key) => explicitPrimary.has(key));
        if (aExplicit !== bExplicit) return aExplicit ? -1 : 1;
        return groupScore(b, scoreByKey) - groupScore(a, scoreByKey);
    });
    spec.Groups = [...details, ...related, ...more];
}

function displayInFormFalseSectionKeys(entity: EntityInfo): string[] {
    const all = entity.RelatedEntities ?? [];
    return all
        .filter((rel) => !rel.DisplayInForm)
        .map((rel) => RelatedEntitySectionKey(rel, all));
}

/**
 * Collapse first-class groups that are the same related entity on different
 * join fields (Bill-To Orders + Ship-To Orders → one Orders rail item).
 */
function mergeRelatedGroupsByEntity(spec: FormChromeSpec, entity: EntityInfo): void {
    const displayInForm = entity.RelatedEntities.filter((rel) => rel.DisplayInForm);
    const entityIdByKey = new Map<string, string>();
    const titleByEntityId = new Map<string, string>();
    for (const rel of displayInForm) {
        const key = RelatedEntitySectionKey(rel, displayInForm);
        const id = (rel.RelatedEntityID ?? '').toLowerCase();
        if (!id) continue;
        entityIdByKey.set(key, id);
        const named = rel.DisplayName?.trim();
        if (named) titleByEntityId.set(id, named);
        else if (!titleByEntityId.has(id)) {
            titleByEntityId.set(id, HumanizeEntityTitle(rel.RelatedEntity));
        }
    }

    const details = spec.Groups.filter((g) => g.Key === DETAILS_SECTION_KEY);
    const more = spec.Groups.filter((g) => g.IsMore);
    const related = spec.Groups.filter((g) => !g.IsMore && g.Key !== DETAILS_SECTION_KEY);
    const merged: FormChromeGroup[] = [];
    const byEntity = new Map<string, FormChromeGroup>();

    for (const group of related) {
        const entityId = group.SectionKeys
            .map((key) => entityIdByKey.get(key))
            .find((id): id is string => !!id);
        if (!entityId) {
            merged.push(group);
            continue;
        }
        const existing = byEntity.get(entityId);
        if (!existing) {
            const copy: FormChromeGroup = {
                ...group,
                Title: titleByEntityId.get(entityId) || group.Title,
                SectionKeys: [...group.SectionKeys],
            };
            byEntity.set(entityId, copy);
            merged.push(copy);
            continue;
        }
        for (const key of group.SectionKeys) {
            if (!existing.SectionKeys.includes(key)) existing.SectionKeys.push(key);
        }
        const preferred = titleByEntityId.get(entityId);
        if (preferred) existing.Title = preferred;
    }

    spec.Groups = [...details, ...merged, ...more];
}

function groupScore(group: FormChromeGroup, scoreByKey: ReadonlyMap<string, number>): number {
    let max = Number.NEGATIVE_INFINITY;
    for (const key of group.SectionKeys) {
        const score = scoreByKey.get(key);
        if (score != null && score > max) max = score;
    }
    return max === Number.NEGATIVE_INFINITY ? 0 : max;
}

function addMissingRelatedGroups(
    spec: FormChromeSpec,
    entity: EntityInfo,
    relatedRoles: ReadonlyMap<string, FormRole>,
    hiddenSectionKeys: ReadonlySet<string> = new Set(),
): void {
    const displayInForm = entity.RelatedEntities.filter((rel) => rel.DisplayInForm);
    const known = new Set<string>([
        ...spec.Groups.flatMap((g) => g.SectionKeys),
        ...spec.MoreSectionKeys,
        ...hiddenSectionKeys,
    ]);

    for (const rel of displayInForm) {
        const sectionKey = RelatedEntitySectionKey(rel, displayInForm);
        if (known.has(sectionKey) || hiddenSectionKeys.has(sectionKey)) continue;
        const role = relatedRoles.get(sectionKey);
        if (role === 'Detail') {
            spec.MoreSectionKeys.push(sectionKey);
            known.add(sectionKey);
            continue;
        }
        if (role === 'Primary') {
            const title = HumanizeEntityTitle(rel.DisplayName?.trim() || rel.RelatedEntity);
            const existing = spec.Groups.find(
                (g) => !g.IsMore && g.Title.trim().toLowerCase() === title.toLowerCase(),
            );
            if (existing) {
                existing.SectionKeys.push(sectionKey);
            } else {
                spec.Groups.push({
                    Key: sectionKey,
                    Title: title,
                    Icon: relatedRailIcon(rel),
                    SectionKeys: [sectionKey],
                    IsMore: false,
                });
            }
            known.add(sectionKey);
        }
    }

    appendMoreGroup(spec.Groups, spec.MoreSectionKeys);

    spec.Layout = ResolveFormLayout(entity.ConfigurationObject?.UI?.Form ?? null, spec.Groups.length);
}

function countFirstClass(spec: FormChromeSpec): number {
    return spec.Groups.length;
}
