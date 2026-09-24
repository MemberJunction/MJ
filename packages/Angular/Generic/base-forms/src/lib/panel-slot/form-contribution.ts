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
import { CountByUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
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

export interface FormContributionRegistration {
    Priority: number;
    Metadata: FormPanelRegistrationMetadata;
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
    BakedSectionKey: string;
    DisplayName: string;
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
    // Normalize the target once and stop at the second match. UUIDsEqual's `===` fast path
    // misses on every peer that points elsewhere, so a filter over UUIDsEqual lowercases both
    // sides of every comparison. To key many relationships against the same peers, use
    // CreateRelatedEntitySectionKeyResolver instead.
    const target = NormalizeUUID(relationship.RelatedEntityID);
    let sameEntityCount = 0;
    for (const peer of displayInFormPeers) {
        if (NormalizeUUID(peer.RelatedEntityID) === target && ++sameEntityCount > 1) break;
    }
    return relatedSectionKey(relationship, sameEntityCount > 1);
}

function relatedSectionKey(relationship: FormContributionRelationship, sharesRelatedEntity: boolean): string {
    if (sharesRelatedEntity) {
        return FormSectionCamelCase(
            `${relationship.RelatedEntity} ${StripJoinFieldBrackets(relationship.RelatedEntityJoinField)}`,
        );
    }
    return FormSectionCamelCase(relationship.RelatedEntity);
}

/**
 * Builds a function that returns {@link RelatedEntitySectionKey}`(relationship, displayInFormPeers)`
 * for any relationship, against the ONE peer set passed here. Build it once per peer set, then
 * call it once per relationship. The relationship does not have to be in the peer set (the chrome
 * resolver keys DisplayInForm=false rows against the full list).
 *
 * Building counts each related entity once, so keying all n peers is O(n). Calling
 * RelatedEntitySectionKey per peer is O(n²), which on an entity with ~150 DisplayInForm
 * relationships (MJ: Users), resolved on every change-detection pass, pegged a CPU core.
 * The returned function reflects the peers as they were when it was built.
 */
export function CreateRelatedEntitySectionKeyResolver(
    displayInFormPeers: readonly FormContributionRelationship[],
): (relationship: FormContributionRelationship) => string {
    const countByEntityID = CountByUUID(displayInFormPeers, (peer) => peer.RelatedEntityID);
    return (relationship) => relatedSectionKey(relationship, (countByEntityID.Get(relationship.RelatedEntityID) ?? 0) > 1);
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

function entityMatches(registeredEntity: string, formEntity: string): boolean {
    return registeredEntity === '*' || registeredEntity === formEntity;
}

function applicableRegistrations(
    entityName: string,
    registrations: readonly FormContributionRegistration[],
): FormContributionRegistration[] {
    return registrations.filter((reg) => {
        const entity = reg.Metadata.entity;
        if (!entity || !entityMatches(entity, entityName)) return false;
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

/**
 * Last-wins collapse by contributionKey (or derived related key).
 * Highest Priority keeps the slot. Registrations without a key never collapse.
 */
export function CollapseFormPanelRegistrations<T extends { Priority: number; Metadata: FormPanelRegistrationMetadata }>(
    registrations: readonly T[],
): T[] {
    const winners = new Map<string, T>();
    let uniqueIndex = 0;
    for (const reg of registrations) {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${uniqueIndex++}`;
        const incumbent = winners.get(key);
        if (!incumbent || reg.Priority > incumbent.Priority) {
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

function stockWinner(relationship: FormContributionRelationship, sectionKey: string): FormContributionWinner {
    const join = StripJoinFieldBrackets(relationship.RelatedEntityJoinField);
    return {
        ContributionKey: RelatedContributionKey(relationship.RelatedEntity, join),
        Slot: 'after-related',
        SortKey: -(relationship.Sequence ?? 0),
        Priority: 0,
        Kind: 'stock-grid',
        RelatedEntity: relationship.RelatedEntity,
        RelatedJoinField: join,
        BakedSectionKey: sectionKey,
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
        BakedSectionKey: sectionKey,
        DisplayName: displayName,
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
    const sectionKeyOf = CreateRelatedEntitySectionKeyResolver(peers);

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
        const sectionKey = peer ? sectionKeyOf(peer) : '';
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
            const sectionKey = sectionKeyOf(rel);
            if (claimedKeys.has(key)) {
                if (baked.has(sectionKey)) hiddenBaked.push(sectionKey);
                continue;
            }
            if (baked.has(sectionKey)) continue;
            stock.push(stockWinner(rel, sectionKey));
        }
    } else {
        for (const rel of peers) {
            const key = RelatedContributionKey(rel.RelatedEntity, rel.RelatedEntityJoinField);
            const sectionKey = sectionKeyOf(rel);
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
    const sectionKeyOf = CreateRelatedEntitySectionKeyResolver(peers);
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
        if (peer) keys.push(sectionKeyOf(peer));
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
