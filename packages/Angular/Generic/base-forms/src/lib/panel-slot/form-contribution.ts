/**
 * Form contributions — pure resolve of what should appear on an entity form.
 *
 * A contribution is either a registered BaseFormPanel or the stock related-entity
 * grid. Related claims replace the stock/baked grid. No Angular, no ClassFactory
 * — the host queries registrations and feeds this.
 *
 * Section keys for related panels MUST match CodeGen's camelCase
 * (`angular-codegen.ts` `camelCase` + related-entity sectionKey). If they drift,
 * hide-baked and skip-baked miss and the user sees a double grid.
 */
import type { ClassRegistration } from '@memberjunction/global';
import { UUIDsEqual } from '@memberjunction/global';
import { FormPanelRegistrationMetadata, FormPanelSlot } from './base-form-panel';

/** Minimum relationship shape the composer reads. Satisfied by EntityRelationshipInfo. */
export interface FormContributionRelationship {
    RelatedEntity: string;
    RelatedEntityID: string;
    RelatedEntityJoinField: string;
    DisplayInForm: boolean;
    DisplayName?: string | null;
    Sequence?: number | null;
}

/** Which of the two registration sources produced a contribution. */
export type FormContributionRegistrationSource = 'class' | 'metadata';

export interface FormContributionRegistration {
    /**
     * Rank within a `contributionKey` group, higher wins. For `'class'` registrations this
     * is the ClassFactory registration priority; for `'metadata'` rows it is the row's
     * `Precedence` column. Both mean the same thing here — higher wins — which is why one
     * field carries both.
     */
    Priority: number;
    Metadata: FormPanelRegistrationMetadata;

    /** Omitted on legacy call sites, which are all compiled registrations. */
    Source?: FormContributionRegistrationSource;

    /** `MJ: Components.ID` the panel renders — metadata rows only. */
    ComponentID?: string;

    /** Parsed `Configuration` JSON for metadata rows. */
    Configuration?: Record<string, unknown>;

    Title?: string;
    Icon?: string;
    Presentation?: 'panel' | 'bare';

    /** `MJ: Entity Form Contributions.ID` for metadata rows. */
    RowID?: string;

    /** The ClassFactory registration for compiled panels — carries the component constructor. */
    Registration?: ClassRegistration;
}

export interface ResolveFormContributionsInput {
    EntityName: string;
    RelatedEntities: readonly FormContributionRelationship[];
    /** IS-A child entity IDs — CodeGen skips these (shown in the ISA side panel). */
    IsaChildEntityIDs: readonly string[];
    Registrations: readonly FormContributionRegistration[];
    /** SectionKeys already projected as Variant="related-entity" in the form template. */
    BakedSectionKeys: readonly string[];
    ShowRelatedEntities: boolean;
}

export type FormContributionKind = 'registered' | 'stock-grid';

export interface FormContributionWinner {
    ContributionKey: string;
    Slot: FormPanelSlot;
    SortKey: number;
    Priority: number;
    Kind: FormContributionKind;
    RelatedEntity?: string;
    RelatedJoinField?: string;
    /** Field/other section this registered winner asked to hide. */
    ReplacesSectionKey?: string;
    /** Single field this registered winner stands in for, so the field is not drawn. */
    ReplacesFieldName?: string;
    BakedSectionKey: string;
    DisplayName: string;

    /** Carried through from the registration so consumers can tell the two sources apart. */
    Source?: FormContributionRegistrationSource;
    ComponentID?: string;
    Title?: string;
    Presentation?: 'panel' | 'bare';
}

export interface ResolveFormContributionsResult {
    Winners: FormContributionWinner[];
    /** CodeGen section keys to hide because a registered panel claimed them. */
    HiddenBakedSectionKeys: string[];
    /** Stock grids the host should mount (unclaimed and not already baked). */
    StockGrids: FormContributionWinner[];
}

/** Strip wrapping [] from a join field, matching CodeGen's tab-name helper. */
export function StripJoinFieldBrackets(joinField: string | null | undefined): string {
    return (joinField ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * camelCase + identifier sanitize. Byte-compatible with
 * `CodeGenLib` `angular-codegen.ts` `camelCase` — do not "improve".
 */
export function FormSectionCamelCase(str: string): string {
    const sanitized = str.replace(/[^a-zA-Z0-9\s]/g, ' ');
    let result = sanitized
        .replace(/\s(.)/g, (_match, char: string) => char.toUpperCase())
        .replace(/\s/g, '')
        .replace(/^(.)/, (_match, char: string) => char.toLowerCase());
    if (/^\d/.test(result)) {
        result = '_' + result;
    }
    return result.length === 0 ? 'section' : result;
}

export function RelatedContributionKey(relatedEntity: string, joinField?: string | null): string {
    return `related:${relatedEntity.trim()}:${StripJoinFieldBrackets(joinField)}`;
}

export function ResolveContributionKey(meta: FormPanelRegistrationMetadata): string {
    if (meta.contributionKey && meta.contributionKey.trim().length > 0) {
        return meta.contributionKey.trim();
    }
    if (meta.relatedEntity && meta.relatedEntity.trim().length > 0) {
        return RelatedContributionKey(meta.relatedEntity, meta.relatedJoinField);
    }
    return '';
}

/**
 * SectionKey CodeGen emits for a related-entity panel. When more than one
 * DisplayInForm relationship points at the same entity, the join field is
 * appended so BillTo / ShipTo do not collide.
 */
export function RelatedEntitySectionKey(
    relationship: FormContributionRelationship,
    displayInFormPeers: readonly FormContributionRelationship[],
): string {
    const sameEntity = displayInFormPeers.filter((peer) =>
        UUIDsEqual(peer.RelatedEntityID, relationship.RelatedEntityID),
    );
    if (sameEntity.length > 1) {
        return FormSectionCamelCase(
            `${relationship.RelatedEntity} ${StripJoinFieldBrackets(relationship.RelatedEntityJoinField)}`,
        );
    }
    return FormSectionCamelCase(relationship.RelatedEntity);
}

export function RelationshipDisplayName(relationship: FormContributionRelationship): string {
    const named = relationship.DisplayName?.trim();
    const raw = named && named.length > 0 ? named : relationship.RelatedEntity;
    return raw.replace(/^[A-Za-z][A-Za-z0-9_]*:\s+/, '').trim() || raw;
}

function isIsaChild(relationship: FormContributionRelationship, isaChildIds: readonly string[]): boolean {
    return isaChildIds.some((id) => UUIDsEqual(id, relationship.RelatedEntityID));
}

function visibleRelationships(
    related: readonly FormContributionRelationship[],
    isaChildIds: readonly string[],
): FormContributionRelationship[] {
    const visible = related.filter((rel) => rel.DisplayInForm && !isIsaChild(rel, isaChildIds));
    return [...visible].sort((a, b) => {
        const aSeq = a.Sequence ?? 999999;
        const bSeq = b.Sequence ?? 999999;
        if (aSeq !== bSeq) return aSeq - bSeq;
        return a.RelatedEntity.localeCompare(b.RelatedEntity);
    });
}

/**
 * Strict entity match shared by the composer and the slot host. `'*'` matches every form.
 *
 * Exported because the slot host used to run its own prefix-insensitive variant, which
 * mounted panels the composer then ignored — the two sides disagreed about which panels
 * existed. One predicate, used by both.
 */
export function FormContributionEntityMatches(registeredEntity: string | null | undefined, formEntity: string): boolean {
    if (!registeredEntity) return false;
    return registeredEntity === '*' || registeredEntity === formEntity;
}

function applicableRegistrations(
    entityName: string,
    registrations: readonly FormContributionRegistration[],
): FormContributionRegistration[] {
    return registrations.filter((reg) => {
        const entity = reg.Metadata.entity;
        if (!entity || !FormContributionEntityMatches(entity, entityName)) return false;
        // A related claim on entity:'*' would hide that grid on every form.
        // Claims must name the form entity.
        // Related / field-section claims on entity:'*' would hide panels on every
        // form. Those claims must name the form entity.
        if ((reg.Metadata.relatedEntity || reg.Metadata.replacesSectionKey) && entity === '*') {
            return false;
        }
        return true;
    });
}

function sourceRank(source: FormContributionRegistrationSource | undefined): number {
    // Compiled registrations win ties. A metadata row replaces an installed piece only
    // when someone set it strictly higher, which the apply flow does after the user
    // confirms the replacement.
    return source === 'metadata' ? 0 : 1;
}

/**
 * Last-wins collapse by contributionKey (or derived related key).
 * Highest Priority keeps the slot; ties go to the compiled registration. Registrations
 * without a key never collapse.
 *
 * The tie-break is an explicit comparator rather than input ordering, so the result does
 * not depend on which source the caller concatenated first.
 */
export function CollapseFormPanelRegistrations<T extends { Priority: number; Metadata: FormPanelRegistrationMetadata; Source?: FormContributionRegistrationSource }>(
    registrations: readonly T[],
): T[] {
    const winners = new Map<string, T>();
    let uniqueIndex = 0;
    for (const reg of registrations) {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${uniqueIndex++}`;
        const incumbent = winners.get(key);
        const beats = !incumbent
            || reg.Priority > incumbent.Priority
            || (reg.Priority === incumbent.Priority && sourceRank(reg.Source) > sourceRank(incumbent.Source));
        if (beats) {
            winners.set(key, reg);
        }
    }
    return [...winners.values()];
}

function collapseRegistrations(
    registrations: readonly FormContributionRegistration[],
): Map<string, FormContributionRegistration> {
    const winners = new Map<string, FormContributionRegistration>();
    for (const reg of CollapseFormPanelRegistrations(registrations)) {
        const key = ResolveContributionKey(reg.Metadata) || `${reg.Metadata.entity}:${reg.Metadata.slot}:${reg.Priority}`;
        winners.set(key, reg);
    }
    return winners;
}

function stockWinner(
    relationship: FormContributionRelationship,
    peers: readonly FormContributionRelationship[],
): FormContributionWinner {
    const join = StripJoinFieldBrackets(relationship.RelatedEntityJoinField);
    return {
        ContributionKey: RelatedContributionKey(relationship.RelatedEntity, join),
        Slot: 'after-related',
        SortKey: -(relationship.Sequence ?? 0),
        Priority: 0,
        Kind: 'stock-grid',
        RelatedEntity: relationship.RelatedEntity,
        RelatedJoinField: join,
        BakedSectionKey: RelatedEntitySectionKey(relationship, peers),
        DisplayName: RelationshipDisplayName(relationship),
    };
}

function registeredWinner(
    key: string,
    reg: FormContributionRegistration,
    sectionKey: string,
    displayName: string,
): FormContributionWinner {
    const meta = reg.Metadata;
    return {
        ContributionKey: key,
        Slot: meta.slot,
        SortKey: meta.sortKey ?? 0,
        Priority: reg.Priority,
        Kind: 'registered',
        RelatedEntity: meta.relatedEntity,
        RelatedJoinField: meta.relatedJoinField ? StripJoinFieldBrackets(meta.relatedJoinField) : undefined,
        ReplacesSectionKey: meta.replacesSectionKey?.trim() || undefined,
        ReplacesFieldName: meta.replacesFieldName?.trim() || undefined,
        BakedSectionKey: sectionKey,
        DisplayName: displayName,
        Source: reg.Source,
        ComponentID: reg.ComponentID,
        Title: reg.Title,
        Presentation: reg.Presentation ?? meta.presentation,
    };
}

function sortWinners(winners: FormContributionWinner[]): FormContributionWinner[] {
    return [...winners].sort((a, b) => {
        if (a.SortKey !== b.SortKey) return b.SortKey - a.SortKey;
        if (a.Priority !== b.Priority) return b.Priority - a.Priority;
        return a.ContributionKey.localeCompare(b.ContributionKey);
    });
}

/**
 * Resolve what belongs on the form. Stock grids are only those the template
 * did not already bake and that no panel claimed.
 */
export function ResolveFormContributions(input: ResolveFormContributionsInput): ResolveFormContributionsResult {
    const peers = visibleRelationships(input.RelatedEntities, input.IsaChildEntityIDs);
    const collapsed = collapseRegistrations(applicableRegistrations(input.EntityName, input.Registrations));
    const baked = new Set(input.BakedSectionKeys);

    const claimedKeys = new Set<string>();
    const registered: FormContributionWinner[] = [];
    for (const [key, reg] of collapsed) {
        const related = reg.Metadata.relatedEntity?.trim();
        const peer = related
            ? peers.find((rel) => {
                  if (rel.RelatedEntity !== related) return false;
                  const wantJoin = StripJoinFieldBrackets(reg.Metadata.relatedJoinField);
                  if (!wantJoin) return true;
                  return StripJoinFieldBrackets(rel.RelatedEntityJoinField) === wantJoin;
              })
            : undefined;
        const sectionKey = peer ? RelatedEntitySectionKey(peer, peers) : '';
        if (related) {
            claimedKeys.add(key);
            // A claim that omits the join field covers every FK to that entity.
            if (!StripJoinFieldBrackets(reg.Metadata.relatedJoinField)) {
                for (const match of peers.filter((rel) => rel.RelatedEntity === related)) {
                    claimedKeys.add(RelatedContributionKey(match.RelatedEntity, match.RelatedEntityJoinField));
                }
            }
        }
        registered.push(
            registeredWinner(key, reg, sectionKey, peer ? RelationshipDisplayName(peer) : related ?? key),
        );
    }

    const hiddenBaked: string[] = [];
    const stock: FormContributionWinner[] = [];
    if (input.ShowRelatedEntities) {
        for (const rel of peers) {
            const key = RelatedContributionKey(rel.RelatedEntity, rel.RelatedEntityJoinField);
            const sectionKey = RelatedEntitySectionKey(rel, peers);
            if (claimedKeys.has(key)) {
                if (baked.has(sectionKey)) hiddenBaked.push(sectionKey);
                continue;
            }
            if (baked.has(sectionKey)) continue;
            stock.push(stockWinner(rel, peers));
        }
    } else {
        for (const rel of peers) {
            const key = RelatedContributionKey(rel.RelatedEntity, rel.RelatedEntityJoinField);
            const sectionKey = RelatedEntitySectionKey(rel, peers);
            if (claimedKeys.has(key) && baked.has(sectionKey)) hiddenBaked.push(sectionKey);
        }
    }

    return {
        Winners: sortWinners([...registered, ...stock]),
        HiddenBakedSectionKeys: hiddenBaked,
        StockGrids: sortWinners(stock),
    };
}

/** Section keys a form should hide because a winning contribution claimed them. */
export function ContributionHiddenSectionKeys(
    entityName: string,
    relatedEntities: readonly FormContributionRelationship[],
    isaChildEntityIDs: readonly string[],
    registrations: readonly FormContributionRegistration[],
): string[] {
    const resolved = ResolveFormContributions({
        EntityName: entityName,
        RelatedEntities: relatedEntities,
        IsaChildEntityIDs: isaChildEntityIDs,
        Registrations: registrations,
        BakedSectionKeys: [],
        ShowRelatedEntities: true,
    });
    const peers = visibleRelationships(relatedEntities, isaChildEntityIDs);
    const keys: string[] = [];
    for (const winner of resolved.Winners) {
        if (winner.Kind !== 'registered') continue;
        if (winner.ReplacesSectionKey) keys.push(winner.ReplacesSectionKey);
        if (!winner.RelatedEntity) continue;
        const peer = peers.find((rel) => {
            if (rel.RelatedEntity !== winner.RelatedEntity) return false;
            if (!winner.RelatedJoinField) return true;
            return StripJoinFieldBrackets(rel.RelatedEntityJoinField) === winner.RelatedJoinField;
        });
        if (peer) keys.push(RelatedEntitySectionKey(peer, peers));
    }
    return keys;
}

/** @deprecated Use {@link ContributionHiddenSectionKeys}. */
export function ClaimedRelatedSectionKeys(
    entityName: string,
    relatedEntities: readonly FormContributionRelationship[],
    isaChildEntityIDs: readonly string[],
    registrations: readonly FormContributionRegistration[],
): string[] {
    return ContributionHiddenSectionKeys(entityName, relatedEntities, isaChildEntityIDs, registrations);
}

/**
 * Field names a winning contribution stands in for, so the form stops drawing them.
 *
 * Separate from {@link ContributionHiddenSectionKeys} because the two hide different
 * things: a section key removes a whole card, a field name removes one input from inside
 * one. The panel that made the claim renders at the top of the section that held the field,
 * which is the collapsible panel's job — this only says which fields are spoken for.
 */
export function ContributionClaimedFieldNames(
    entityName: string,
    relatedEntities: readonly FormContributionRelationship[],
    isaChildEntityIDs: readonly string[],
    registrations: readonly FormContributionRegistration[],
): string[] {
    const resolved = ResolveFormContributions({
        EntityName: entityName,
        RelatedEntities: relatedEntities,
        IsaChildEntityIDs: isaChildEntityIDs,
        Registrations: registrations,
        BakedSectionKeys: [],
        ShowRelatedEntities: true,
    });
    const names: string[] = [];
    for (const winner of resolved.Winners) {
        if (winner.Kind !== 'registered') continue;
        if (winner.ReplacesFieldName) names.push(winner.ReplacesFieldName);
    }
    return names;
}
