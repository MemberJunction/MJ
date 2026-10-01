// packages/Angular/Generic/base-forms/src/lib/chrome/form-composition-snapshot.ts
import type { FormInclusion, FormRole } from '@memberjunction/core';
import type { FormPanelSlot } from '../panel-slot/base-form-panel';
import {
    CreateRelatedEntitySectionKeyResolver,
    RelatedContributionKey,
    ResolveContributionKey,
    ReplacedSectionKeys,
    ResolveFormContributionWinners,
    ResolveFormContributions,
    StripJoinFieldBrackets,
    VisibleFormRelationships,
    type FormContributionRegistration,
    type FormContributionRelationship,
} from '../panel-slot/form-contribution';
import { IsPanelHiddenByUser } from '../panel-slot/panel-hides';
import type { FormChromeGroup, FormChromePanelSnapshot } from './form-chrome';

/**
 * What is on this form right now — the input the apply flow needs to add or replace one piece.
 * Built by the container after every chrome resolve that changes it; published through
 * `BaseFormComponent.CompositionChanged` and the `FormCompositionRegistry`. It stays in the
 * browser: an agent is handed the compact {@link FormAgentContext} built from it.
 */
export interface FormCompositionSection {
    Key: string;
    Title: string;
    Variant: string;
    /** Rail group key, or null when the section is not in any first-class group. */
    Group: string | null;
    Hidden: boolean;
    /**
     * The inputs this section draws, so a panel can be offered one field to stand in for.
     * Empty for a section with no fields of its own, such as a related grid.
     */
    Fields: Array<{ Name: string; Label: string }>;
}

export interface FormCompositionRelated {
    Entity: string;
    JoinField: string;
    SectionKey: string;
    Inclusion: FormInclusion | 'Auto';
    /** baked = in the template; stock = container fill-in; claimed = a contribution replaced it. */
    Source: 'baked' | 'stock' | 'claimed';
}

export interface FormCompositionContribution {
    Key: string;
    Slot: FormPanelSlot;
    Source: 'class' | 'metadata';
    Title: string;
    Presentation: 'panel' | 'bare';
    /** Suppressed by an L3 rule or inclusion None, or hidden by this user. */
    Hidden: boolean;
    /** Last-wins rank; the apply flow uses incumbent + 1 to replace a compiled piece. */
    Precedence: number;
    /** Order among panels in the same slot, higher first. */
    SortKey: number;
    /** The section it is placed in, replacing nothing. */
    InSectionKey?: string;
    /** Where inside its section it draws. */
    SectionPosition?: 'start' | 'end';
    /** Fields it stands in for. */
    FieldNames?: string[];
    /** Blocks it stands in for. */
    SectionKeys?: string[];
    /** True when it stands in for a section, tab or grid. */
    ReplacesPlace?: boolean;
}

/** Which form the user sees: the standard form, or one full custom form. */
export interface FormCompositionChoice {
    /** True when a full custom form owns the whole body, so no section, grid or panel draws. */
    FullCustomForm: boolean;
    /** The `MJ: Entity Form Overrides` row the user sees, or null for the standard form. */
    OverrideID: string | null;
    /** The form's name in the form picker. */
    Label: string;
}

export interface FormCompositionSnapshot {
    Entity: string;
    /**
     * The record this composition was built for, as `CompositeKey.ToURLSegment()`, which
     * `CompositeKey.FromURLSegment` reads back. Null for a record not saved yet.
     * `AdditionalContext` is app-global and replaced wholesale by whichever surface
     * published last, so a consumer needs to be able to tell which record a snapshot
     * describes rather than assuming it matches the conversation.
     */
    RecordPrimaryKey: string | null;
    FormChoice: FormCompositionChoice;
    Layout: 'accordion' | 'left-nav';
    Sections: FormCompositionSection[];
    Related: FormCompositionRelated[];
    Contributions: FormCompositionContribution[];
    /** The side rail this form shows, in order, with the panels filed under each item. */
    Rail: FormCompositionRailItem[];
    SlotsPresent: FormPanelSlot[];
    ChromeRuleCount: number;
}

/** One rail item, as a consumer outside the form needs it. */
export interface FormCompositionRailItem {
    Key: string;
    Title: string;
    Icon: string;
    SectionKeys: string[];
    IsMore: boolean;
}

export interface BuildFormCompositionSnapshotInput {
    EntityName: string;
    RecordPrimaryKey: string | null;
    FormChoice: FormCompositionChoice;
    Layout: 'accordion' | 'left-nav';
    Groups: readonly FormChromeGroup[];
    /** Every section on the form, the hidden ones included. */
    Panels: readonly FormChromePanelSnapshot[];
    /** The sections in {@link Panels} the form does not show. */
    HiddenSectionKeys: ReadonlySet<string>;
    RelatedEntities: readonly FormContributionRelationship[];
    IsaChildEntityIDs: readonly string[];
    BakedSectionKeys: readonly string[];
    /** Every registration on the form, including the panels this user hid. */
    Registrations: readonly FormContributionRegistration[];
    /** The keys of the panels this user hid. Their registrations are listed, marked hidden. */
    HiddenPanelKeys?: readonly string[];
    /** SectionKey → resolved role for related grids (Primary | Detail). Detail reads as More. */
    RelatedRoles: ReadonlyMap<string, FormRole>;
    HiddenContributionKeys: ReadonlySet<string>;
    SlotsPresent: readonly FormPanelSlot[];
    ChromeRuleCount: number;
}

function groupOf(groups: readonly FormChromeGroup[], sectionKey: string): string | null {
    return groups.find((g) => !g.IsMore && g.SectionKeys.includes(sectionKey))?.Key ?? null;
}

function presentationOf(reg: FormContributionRegistration): 'panel' | 'bare' {
    // No `contributionKey === 'header'` fallback: `presentation` is now the only
    // statement of hero-ness, on both sources. A11 migrates the panels that relied
    // on the old convention — and none of them actually rendered, so nothing regresses.
    return reg.Presentation ?? reg.Metadata.presentation ?? 'panel';
}

export function BuildFormCompositionSnapshot(input: BuildFormCompositionSnapshotInput): FormCompositionSnapshot {
    const userHidden = new Set(input.HiddenPanelKeys ?? []);
    const isUserHidden = (reg: FormContributionRegistration) => IsPanelHiddenByUser(reg, userHidden);
    const drawn = userHidden.size > 0 ? input.Registrations.filter((reg) => !isUserHidden(reg)) : input.Registrations;
    const resolved = ResolveFormContributions({
        EntityName: input.EntityName,
        RelatedEntities: input.RelatedEntities,
        IsaChildEntityIDs: input.IsaChildEntityIDs,
        Registrations: drawn,
        BakedSectionKeys: input.BakedSectionKeys,
        ShowRelatedEntities: true,
    });
    const stockKeys = new Set(resolved.StockGrids.map((g) => g.ContributionKey));
    const claimedKeys = new Set(
        resolved.Winners.filter((w) => w.Kind === 'registered' && w.RelatedEntity)
            .map((w) => RelatedContributionKey(w.RelatedEntity as string, w.RelatedJoinField)),
    );

    const visibleRelated = VisibleFormRelationships(input.RelatedEntities, input.IsaChildEntityIDs);
    const sectionKeyOf = CreateRelatedEntitySectionKeyResolver(visibleRelated);

    const related: FormCompositionRelated[] = visibleRelated.map((rel) => {
        const join = StripJoinFieldBrackets(rel.RelatedEntityJoinField);
        const key = RelatedContributionKey(rel.RelatedEntity, join);
        const sectionKey = sectionKeyOf(rel);
        const role = input.RelatedRoles.get(sectionKey);
        return {
            Entity: rel.RelatedEntity,
            JoinField: join,
            SectionKey: sectionKey,
            Inclusion: role === 'Primary' ? 'Primary' : role === 'Detail' ? 'More' : 'Auto',
            Source: claimedKeys.has(key) ? 'claimed' : stockKeys.has(key) ? 'stock' : 'baked',
        };
    });

    let unique = 0;
    const winners = ResolveFormContributionWinners(input.EntityName, input.Registrations).Winners;
    const contributions: FormCompositionContribution[] = winners.map((reg) => {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${unique++}`;
        return {
            Key: key,
            Slot: reg.Metadata.slot,
            Source: reg.Source ?? 'class',
            Title: reg.Title ?? reg.Metadata.contributionKey ?? key,
            Presentation: presentationOf(reg),
            Hidden: input.HiddenContributionKeys.has(key) || isUserHidden(reg),
            Precedence: reg.Priority,
            SortKey: reg.Metadata.sortKey ?? 0,
            ...(reg.Metadata.inSectionKey ? { InSectionKey: reg.Metadata.inSectionKey } : {}),
            ...(reg.Metadata.sectionPosition ? { SectionPosition: reg.Metadata.sectionPosition } : {}),
            ...(reg.Metadata.replacesFieldNames?.length ? { FieldNames: [...reg.Metadata.replacesFieldNames] } : {}),
            ...(ReplacedSectionKeys(reg.Metadata).length > 0 ? { SectionKeys: [...ReplacedSectionKeys(reg.Metadata)] } : {}),
            ...(ReplacedSectionKeys(reg.Metadata).length > 0 || reg.Metadata.relatedEntity ? { ReplacesPlace: true } : {}),
        };
    });

    return {
        Entity: input.EntityName,
        RecordPrimaryKey: input.RecordPrimaryKey,
        FormChoice: { ...input.FormChoice },
        Layout: input.Layout,
        Sections: input.Panels.map((p) => ({
            Key: p.SectionKey,
            Title: p.SectionName,
            Variant: p.Variant,
            Group: groupOf(input.Groups, p.SectionKey),
            Hidden: input.HiddenSectionKeys.has(p.SectionKey),
            Fields: (p.Fields ?? []).map((f) => ({ Name: f.Name, Label: f.Label })),
        })),
        Related: related,
        Contributions: contributions,
        Rail: input.Groups.map((group) => ({
            Key: group.Key,
            Title: group.Title,
            Icon: group.Icon,
            SectionKeys: [...group.SectionKeys],
            IsMore: group.IsMore === true,
        })),
        SlotsPresent: [...input.SlotsPresent],
        ChromeRuleCount: input.ChromeRuleCount,
    };
}

/**
 * Whether two snapshots describe the same form. Snapshots are plain data built by
 * {@link BuildFormCompositionSnapshot} in a fixed key order, so their JSON text compares them.
 */
export function FormCompositionSnapshotsEqual(a: FormCompositionSnapshot | null, b: FormCompositionSnapshot | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

/** One section of {@link FormAgentContext}. */
export interface FormAgentContextSection {
    Key: string;
    Title: string;
    Variant: string;
    Hidden: boolean;
    /** The contribution that draws this section or stands in for it, or null when none does. */
    ContributionKey: string | null;
}

/**
 * The form the user is looking at, as an agent sees it in `AppContext.AdditionalContext.Form`.
 *
 * Every value of `AdditionalContext` goes into every agent prompt, so this carries only what
 * identifies the form and its sections. The rest (fields, rail, contribution details) stays in
 * the full {@link FormCompositionSnapshot}, which the apply flow reads from the
 * `FormCompositionRegistry`, and the `Get Form Composition For Entity` and
 * `Get Form Contributions For Entity` actions report it to an agent that needs it. Keep field
 * names stable.
 */
export interface FormAgentContext {
    Entity: string;
    /** The record, as `CompositeKey.ToURLSegment()`; null for a record not saved yet. */
    RecordPrimaryKey: string | null;
    FormChoice: FormCompositionChoice;
    Sections: FormAgentContextSection[];
}

/** The compact {@link FormAgentContext} of a snapshot. */
export function BuildFormAgentContext(snapshot: FormCompositionSnapshot): FormAgentContext {
    const contributionKeys = new Set(snapshot.Contributions.map((c) => c.Key));
    const holderBySection = new Map<string, string>();
    // Weakest claim first, so a stronger one overwrites it: a grid claim, then a block a
    // contribution stands in for, then the contribution's own section.
    for (const rel of snapshot.Related) {
        const key = RelatedContributionKey(rel.Entity, rel.JoinField);
        if (rel.Source === 'claimed' && contributionKeys.has(key)) holderBySection.set(rel.SectionKey, key);
    }
    for (const c of snapshot.Contributions) {
        for (const sectionKey of c.SectionKeys ?? []) holderBySection.set(sectionKey, c.Key);
    }
    for (const key of contributionKeys) holderBySection.set(key, key);
    return {
        Entity: snapshot.Entity,
        RecordPrimaryKey: snapshot.RecordPrimaryKey,
        FormChoice: { ...snapshot.FormChoice },
        Sections: snapshot.Sections.map((section) => ({
            Key: section.Key,
            Title: section.Title,
            Variant: section.Variant,
            Hidden: section.Hidden,
            ContributionKey: holderBySection.get(section.Key) ?? null,
        })),
    };
}
