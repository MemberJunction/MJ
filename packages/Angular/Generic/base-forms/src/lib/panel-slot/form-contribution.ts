/**
 * Form contributions — pure resolve of what should appear on an entity form.
 *
 * A contribution is either a registered BaseFormPanel or the stock related-entity
 * grid. Related claims replace the stock/baked grid. No Angular, no ClassFactory
 * — the host queries registrations and feeds this.
 *
 * Contribution keys and section keys come from the shared key module in
 * `@memberjunction/interactive-component-types/forms`, which the server actions use too.
 * Section keys for related panels match CodeGen's camelCase (`angular-codegen.ts`), so
 * hide-baked and skip-baked find the grid CodeGen emitted.
 */
import type { ClassRegistration } from '@memberjunction/global';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    DEFAULT_FORM_CONTRIBUTION_SLOT,
    FormSectionCamelCase as SharedFormSectionCamelCase,
    RelatedContributionKey as SharedRelatedContributionKey,
    RelatedGridSectionKey,
    ResolveContributionWriteKey,
    StripJoinFieldBrackets as SharedStripJoinFieldBrackets,
    type FormContributionSpec,
} from '@memberjunction/interactive-component-types/forms';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { ContributionScopeRank, type MJEntityFormContributionEntity } from '@memberjunction/core-entities';
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

    /**
     * Who a metadata row is for. Absent on compiled registrations, which apply to everyone the
     * code puts them in front of. A `User` row a user can see is necessarily their own — the
     * collector only returns personal rows for the current user.
     */
    Scope?: MJEntityFormContributionEntity['Scope'];

    /** The ClassFactory registration for compiled panels — carries the component constructor. */
    Registration?: ClassRegistration;

    /**
     * A panel the placement dialog is showing before it is saved. It draws its component when
     * it carries one, else a placeholder. Only a form inside the dialog's preview sees one.
     */
    IsPreview?: boolean;

    /**
     * The component to render when it has not been saved yet, so there is no `ComponentID` to
     * load. Only the placement preview sets it.
     */
    ComponentSpec?: ComponentSpec;
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
    /** Fields this registered winner stands in for, so they are not drawn. */
    ReplacesFieldNames?: readonly string[];
    /** Further sections this registered winner stands in for, beyond `ReplacesSectionKey`. */
    ReplacesSectionKeys?: readonly string[];
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

/** Strip wrapping [] from a join field. Uses the shared `StripJoinFieldBrackets`. */
export function StripJoinFieldBrackets(joinField: string | null | undefined): string {
    return SharedStripJoinFieldBrackets(joinField);
}

/** camelCase + identifier sanitize, as CodeGen names sections. Uses the shared `FormSectionCamelCase`. */
export function FormSectionCamelCase(str: string): string {
    return SharedFormSectionCamelCase(str);
}

/** `related:<entity>:<join>`. Uses the shared `RelatedContributionKey`. */
export function RelatedContributionKey(relatedEntity: string, joinField?: string | null): string {
    return SharedRelatedContributionKey(relatedEntity, joinField);
}

/**
 * The key a registration collapses by: its own key, else the derived related key. Empty for a
 * registration with neither, which never collapses. Uses the shared `ResolveContributionWriteKey`.
 */
export function ResolveContributionKey(meta: FormPanelRegistrationMetadata): string {
    return ResolveContributionWriteKey(meta, meta.relatedEntity ?? null) ?? '';
}

/**
 * The section key a registration's panel draws under, which the rail, the counts and the chrome
 * group file it by.
 *
 * A row's panel draws under its contribution key ({@link ResolveContributionKey}), or
 * `contribution:<row id>` when it has none. A compiled panel's template names its own section; by
 * convention that is its `contributionKey`, or for a grid claim with no key, the related entity's
 * name after its schema prefix, in camelCase. Empty for a compiled panel with neither.
 */
export function ContributionSectionKey(registration: FormContributionRegistration): string {
    const meta = registration.Metadata;
    if (registration.Source === 'metadata') {
        return ResolveContributionKey(meta) || `contribution:${registration.RowID ?? registration.ComponentID ?? 'unknown'}`;
    }
    const own = meta.contributionKey?.trim();
    if (own) return own;
    // The key compiled panel templates use (`contactMethods`), not the generated-form grid key.
    const entityName = meta.relatedEntity?.split(':').pop()?.trim();
    return entityName ? FormSectionCamelCase(entityName) : '';
}

/**
 * A contribution spec as a registration: the one mapping for a saved row, the placement preview
 * and the artifact viewer's preview. Ranked 0 and keyed only by the spec's own key; a caller that
 * knows more (a row's precedence, a preview's derived key) sets it on the result.
 */
export function ContributionSpecToRegistration(
    entityName: string,
    spec: FormContributionSpec,
    componentID?: string,
): FormContributionRegistration {
    const metadata: FormPanelRegistrationMetadata = {
        entity: entityName,
        slot: spec.slot ?? DEFAULT_FORM_CONTRIBUTION_SLOT,
        sortKey: spec.sortKey ?? 0,
        presentation: spec.presentation,
    };
    if (spec.contributionKey) metadata.contributionKey = spec.contributionKey;
    if (spec.relatedEntity) metadata.relatedEntity = spec.relatedEntity;
    if (spec.relatedJoinField) metadata.relatedJoinField = spec.relatedJoinField;
    if (spec.replacesSectionKey) metadata.replacesSectionKey = spec.replacesSectionKey;
    if (spec.replacesFieldNames?.length) metadata.replacesFieldNames = [...spec.replacesFieldNames];
    if (spec.replacesSectionKeys?.length) metadata.replacesSectionKeys = [...spec.replacesSectionKeys];
    if (spec.inSectionKey) metadata.inSectionKey = spec.inSectionKey;
    if (spec.sectionPosition) metadata.sectionPosition = spec.sectionPosition;
    if (spec.inclusion) metadata.inclusion = spec.inclusion;
    if (spec.chromeGroup) metadata.chromeGroup = spec.chromeGroup;
    const registration: FormContributionRegistration = {
        Priority: 0,
        Metadata: metadata,
        Source: 'metadata',
        Title: spec.title,
        Icon: spec.icon,
        Presentation: spec.presentation,
        Configuration: spec.configuration ?? {},
    };
    if (componentID) registration.ComponentID = componentID;
    return registration;
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
    return RelatedGridSectionKey(relationship.RelatedEntity, relationship.RelatedEntityJoinField, sharesRelatedEntity);
}

/**
 * Builds a function that returns {@link RelatedEntitySectionKey}`(relationship, displayInFormPeers)`
 * for any relationship, against the ONE peer set passed here. Build it once per peer set, then
 * call it once per relationship. The relationship does not have to be in the peer set; it is keyed
 * by how many peers share its related entity.
 *
 * Building counts each related entity once, so keying all n peers is O(n). Calling
 * RelatedEntitySectionKey per peer is O(n²), which on an entity with ~150 DisplayInForm
 * relationships (MJ: Users), resolved on every change-detection pass, pegged a CPU core.
 * The returned function reflects the peers as they were when it was built.
 */
export function CreateRelatedEntitySectionKeyResolver(
    displayInFormPeers: readonly FormContributionRelationship[],
): (relationship: FormContributionRelationship) => string {
    const countByEntityID = new Map<string, number>();
    for (const peer of displayInFormPeers) {
        const id = NormalizeUUID(peer.RelatedEntityID);
        countByEntityID.set(id, (countByEntityID.get(id) ?? 0) + 1);
    }
    return (relationship) =>
        relatedSectionKey(relationship, (countByEntityID.get(NormalizeUUID(relationship.RelatedEntityID)) ?? 0) > 1);
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

/**
 * A wildcard registration that claims a grid or a section, or names a section to draw in. It
 * still mounts, but its claim is ignored: it would take that grid or section from every form.
 */
function isWildcardPlaceClaim(meta: FormPanelRegistrationMetadata): boolean {
    return meta.entity === '*'
        && (!!meta.relatedEntity || ReplacedSectionKeys(meta).length > 0 || !!meta.inSectionKey?.trim());
}

/**
 * Tie-break rank at equal priority, higher wins. A compiled registration beats any row; between
 * rows the narrower audience wins ({@link ContributionScopeRank}: User over Role over Global).
 */
function sourceRank(reg: { Source?: FormContributionRegistrationSource; Scope?: FormContributionRegistration['Scope'] }): number {
    return reg.Source === 'metadata' ? ContributionScopeRank(reg.Scope) : Number.POSITIVE_INFINITY;
}

/**
 * Collapse by key ({@link ResolveContributionKey}, compared exactly). Highest Priority wins; on a
 * tie the compiled registration wins, and between rows the narrower scope. Registrations without
 * a key never collapse.
 *
 * The tie-break is an explicit comparator rather than input ordering, so the result does not
 * depend on which source the caller concatenated first.
 */
export function CollapseFormPanelRegistrations<T extends {
    Priority: number;
    Metadata: FormPanelRegistrationMetadata;
    Source?: FormContributionRegistrationSource;
    Scope?: FormContributionRegistration['Scope'];
}>(
    registrations: readonly T[],
): T[] {
    const winners = new Map<string, T>();
    let uniqueIndex = 0;
    for (const reg of registrations) {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${uniqueIndex++}`;
        const incumbent = winners.get(key);
        const beats = !incumbent
            || reg.Priority > incumbent.Priority
            || (reg.Priority === incumbent.Priority && sourceRank(reg) > sourceRank(incumbent));
        if (beats) {
            winners.set(key, reg);
        }
    }
    return [...winners.values()];
}

/** One form's contributions after the collapse. */
export interface ResolvedFormContributions {
    /**
     * The winners among the registrations for this entity or for every entity (`'*'`): one per
     * key, and each registration that has no key.
     */
    readonly Winners: readonly FormContributionRegistration[];
    /**
     * The winners the rail files, by {@link ContributionSectionKey}: they name the entity rather
     * than the wildcard, draw a section rather than a bare strip, and have a section key.
     */
    readonly RailItems: ReadonlyMap<string, FormContributionRegistration>;
}

const resolvedMemo = new WeakMap<readonly FormContributionRegistration[], Map<string, ResolvedFormContributions>>();

/**
 * The winning registrations on one entity's form, resolved once for the whole form.
 *
 * Every host that draws contributions filters these winners by its own slot or section, so a row
 * that takes a key from a compiled panel draws where the row says, and the compiled panel draws
 * nowhere. Memoized per input list, which the collector returns as a stable reference until
 * something changes, so a caller must not change a list after passing it. The result is shared:
 * callers must not mutate it.
 */
export function ResolveFormContributionWinners(
    entityName: string,
    registrations: readonly FormContributionRegistration[],
): ResolvedFormContributions {
    let byEntity = resolvedMemo.get(registrations);
    const hit = byEntity?.get(entityName);
    if (hit) return hit;
    const applicable = registrations.filter((reg) => FormContributionEntityMatches(reg.Metadata?.entity, entityName));
    const winners = CollapseFormPanelRegistrations(applicable);
    const railItems = new Map<string, FormContributionRegistration>();
    for (const reg of winners) {
        const meta = reg.Metadata;
        if (meta.entity !== entityName || reg.Presentation === 'bare' || meta.presentation === 'bare') continue;
        const key = ContributionSectionKey(reg);
        if (key) railItems.set(key, reg);
    }
    const resolved: ResolvedFormContributions = { Winners: winners, RailItems: railItems };
    if (!byEntity) {
        byEntity = new Map();
        resolvedMemo.set(registrations, byEntity);
    }
    byEntity.set(entityName, resolved);
    return resolved;
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
        ReplacesFieldNames: meta.replacesFieldNames?.length ? [...meta.replacesFieldNames] : undefined,
        ReplacesSectionKeys: meta.replacesSectionKeys?.length ? [...meta.replacesSectionKeys] : undefined,
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
    const winners = ResolveFormContributionWinners(input.EntityName, input.Registrations).Winners;
    const baked = new Set(input.BakedSectionKeys);
    const sectionKeyOf = CreateRelatedEntitySectionKeyResolver(peers);

    const claimedKeys = new Set<string>();
    const registered: FormContributionWinner[] = [];
    for (const reg of winners) {
        if (isWildcardPlaceClaim(reg.Metadata)) continue;
        const key = ResolveContributionKey(reg.Metadata) || `${reg.Metadata.entity}:${reg.Metadata.slot}:${reg.Priority}`;
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
            claimedKeys.add(RelatedContributionKey(related, reg.Metadata.relatedJoinField));
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
        for (const key of winner.ReplacesSectionKeys ?? []) if (key.trim()) keys.push(key.trim());
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

/**
 * Whether this registration is hosted by a section rather than by a slot.
 *
 * A contribution that names fields renders at the top of the section drawing them, which
 * `<mj-form-field-panel-slot>` mounts. It still carries a `slot`, because every row does,
 * so a slot host that went by slot alone would mount it a second time at the bottom of the
 * form — the same panel twice, once in the group and once as a section of its own.
 */
export function ContributionClaimsFields(
    metadata: Pick<FormPanelRegistrationMetadata, 'replacesFieldNames'> | null | undefined,
): boolean {
    return (metadata?.replacesFieldNames ?? []).some((name) => name.trim().length > 0);
}

/**
 * Whether this registration is drawn inside a section rather than by a slot: it stands in for
 * fields, or it names a section to draw in. The section's own host mounts it, so a slot host
 * must not mount it a second time.
 */
export function ContributionDrawsInSection(
    metadata: Pick<FormPanelRegistrationMetadata, 'replacesFieldNames' | 'inSectionKey'> | null | undefined,
): boolean {
    return ContributionClaimsFields(metadata) || !!metadata?.inSectionKey?.trim();
}

/** Where inside its section a section-hosted contribution draws. */
export function ContributionSectionPosition(
    metadata: Pick<FormPanelRegistrationMetadata, 'sectionPosition'> | null | undefined,
): 'start' | 'end' {
    return metadata?.sectionPosition === 'end' ? 'end' : 'start';
}

/** Every section a contribution stands in for: the single key, then the list, without repeats. */
export function ReplacedSectionKeys(
    metadata: Pick<FormPanelRegistrationMetadata, 'replacesSectionKey' | 'replacesSectionKeys'> | null | undefined,
): string[] {
    const out: string[] = [];
    for (const raw of [metadata?.replacesSectionKey, ...(metadata?.replacesSectionKeys ?? [])]) {
        const key = raw?.trim();
        if (key && !out.includes(key)) out.push(key);
    }
    return out;
}

/**
 * Field names the winning contributions stand in for, so the form stops drawing them.
 *
 * Separate from {@link ContributionHiddenSectionKeys} because the two hide different
 * things: a section key removes a whole card, a field name removes one input from inside
 * one. The panel that made the claim renders at the top of the section that held those
 * fields, which is the collapsible panel's job — this only says which fields are spoken for.
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
        for (const name of winner.ReplacesFieldNames ?? []) {
            if (!names.includes(name)) names.push(name);
        }
    }
    return names;
}

/**
 * `DisplayInForm` relationships that can appear on the parent form (IS-A
 * children excluded), in Sequence order — the same peer set
 * {@link ResolveFormContributions} and {@link CreateRelatedEntitySectionKeyResolver} use.
 */
export function VisibleFormRelationships<T extends FormContributionRelationship>(
    related: readonly T[],
    isaChildIds: readonly string[],
): T[] {
    return visibleRelationships(related, isaChildIds) as T[];
}
