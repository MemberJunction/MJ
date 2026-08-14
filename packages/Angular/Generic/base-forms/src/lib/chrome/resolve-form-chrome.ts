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

export interface ResolveFormChromeInput {
    Entity: EntityInfo;
    Panels: FormChromePanelSnapshot[];
    /** Related-entity schema by entity ID. Built from the active provider. */
    RelatedSchemaByEntityId: ReadonlyMap<string, string>;
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
): RelatedFormRoleCandidate[] {
    return entity.RelatedEntities.map((rel) => toCandidate(rel, relatedSchemaByEntityId));
}

export function ResolveFormChrome(input: ResolveFormChromeInput): ResolveFormChromeResult {
    const formConfig = input.Entity.ConfigurationObject?.UI?.Form ?? null;
    const resolution = ResolveRelatedFormRoles(
        input.Entity.SchemaName,
        formConfig,
        BuildRelatedFormRoleCandidates(input.Entity, input.RelatedSchemaByEntityId),
    );

    const relatedRoles = mapRelatedRoles(input.Entity, resolution.Assignments);
    const defaultSpec = BuildDefaultChromeSpec(input.Panels, relatedRoles, formConfig);
    addMissingRelatedGroups(defaultSpec, input.Entity, relatedRoles);

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
            return { Spec: override, RelatedRoles: resolution, PolicyUsed: true };
        }
    }

    return { Spec: defaultSpec, RelatedRoles: resolution, PolicyUsed: false };
}

export function BuildDefaultChromeSpec(
    panels: FormChromePanelSnapshot[],
    relatedRoles: ReadonlyMap<string, FormRole>,
    formConfig: IEntityFormConfiguration | null,
): FormChromeSpec {
    const moreKeys: string[] = [];
    const fieldKeys: string[] = [];
    const relatedGroups: FormChromeGroup[] = [];

    for (const panel of panels) {
        if (!panel.SectionKey) continue;
        if (IsAlwaysMoreSection(panel.SectionKey, panel.SectionName)) {
            moreKeys.push(panel.SectionKey);
            continue;
        }
        if (panel.Variant === 'related-entity') {
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
): RelatedFormRoleCandidate {
    const schema = relatedSchemaByEntityId.get((rel.RelatedEntityID ?? '').toLowerCase())
        ?? relatedSchemaByEntityId.get(rel.RelatedEntityID ?? '')
        ?? '';
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
    };
}

function addMissingRelatedGroups(
    spec: FormChromeSpec,
    entity: EntityInfo,
    relatedRoles: ReadonlyMap<string, FormRole>,
): void {
    const displayInForm = entity.RelatedEntities.filter((rel) => rel.DisplayInForm);
    const known = new Set<string>([
        ...spec.Groups.flatMap((g) => g.SectionKeys),
        ...spec.MoreSectionKeys,
    ]);

    for (const rel of displayInForm) {
        const sectionKey = RelatedEntitySectionKey(rel, displayInForm);
        if (known.has(sectionKey)) continue;
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
