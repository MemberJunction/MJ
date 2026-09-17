// packages/Angular/Generic/base-forms/src/lib/chrome/form-composition-snapshot.ts
import type { FormInclusion, FormRole } from '@memberjunction/core';
import type { FormPanelSlot } from '../panel-slot/base-form-panel';
import {
    CollapseFormPanelRegistrations,
    RelatedContributionKey,
    RelatedEntitySectionKey,
    ResolveContributionKey,
    ResolveFormContributions,
    StripJoinFieldBrackets,
    type FormContributionRegistration,
    type FormContributionRelationship,
} from '../panel-slot/form-contribution';
import type { FormChromeGroup, FormChromePanelSnapshot } from './form-chrome';

/**
 * What is on this form right now — the input an agent needs to add or replace one piece.
 * Built by the container after every chrome resolve; published through
 * `BaseFormComponent.CompositionChanged`, then `NavigationService.SetAgentContext`.
 * Shape is mirrored by `SkipFormContext` in @askskip/types; keep field names stable.
 */
export interface FormCompositionSection {
    Key: string;
    Title: string;
    Variant: string;
    /** Rail group key, or null when the section is not in any first-class group. */
    Group: string | null;
    Hidden: boolean;
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
    /** Suppressed by an L3 rule or inclusion None. */
    Hidden: boolean;
    /** Last-wins rank; the apply flow uses incumbent + 1 to replace a compiled piece. */
    Precedence: number;
}

export interface FormCompositionSnapshot {
    Entity: string;
    /**
     * The record this composition was built for, as `PrimaryKey.ToString()`.
     * `AdditionalContext` is app-global and replaced wholesale by whichever surface
     * published last, so a consumer needs to be able to tell which record a snapshot
     * describes rather than assuming it matches the conversation.
     */
    RecordPrimaryKey: string;
    Layout: 'accordion' | 'left-nav';
    Sections: FormCompositionSection[];
    Related: FormCompositionRelated[];
    Contributions: FormCompositionContribution[];
    SlotsPresent: FormPanelSlot[];
    ChromeRuleCount: number;
}

export interface BuildFormCompositionSnapshotInput {
    EntityName: string;
    RecordPrimaryKey: string;
    Layout: 'accordion' | 'left-nav';
    Groups: readonly FormChromeGroup[];
    Panels: readonly FormChromePanelSnapshot[];
    HiddenSectionKeys: ReadonlySet<string>;
    RelatedEntities: readonly FormContributionRelationship[];
    IsaChildEntityIDs: readonly string[];
    BakedSectionKeys: readonly string[];
    Registrations: readonly FormContributionRegistration[];
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
    const resolved = ResolveFormContributions({
        EntityName: input.EntityName,
        RelatedEntities: input.RelatedEntities,
        IsaChildEntityIDs: input.IsaChildEntityIDs,
        Registrations: input.Registrations,
        BakedSectionKeys: input.BakedSectionKeys,
        ShowRelatedEntities: true,
    });
    const stockKeys = new Set(resolved.StockGrids.map((g) => g.ContributionKey));
    const claimedKeys = new Set(
        resolved.Winners.filter((w) => w.Kind === 'registered' && w.RelatedEntity)
            .map((w) => RelatedContributionKey(w.RelatedEntity as string, w.RelatedJoinField)),
    );

    const visibleRelated = input.RelatedEntities
        .filter((rel) => rel.DisplayInForm && !input.IsaChildEntityIDs.some((id) => id.toLowerCase() === rel.RelatedEntityID.toLowerCase()))
        .sort((a, b) => (a.Sequence ?? 999999) - (b.Sequence ?? 999999) || a.RelatedEntity.localeCompare(b.RelatedEntity));

    const related: FormCompositionRelated[] = visibleRelated.map((rel) => {
        const join = StripJoinFieldBrackets(rel.RelatedEntityJoinField);
        const key = RelatedContributionKey(rel.RelatedEntity, join);
        const sectionKey = RelatedEntitySectionKey(rel, visibleRelated);
        const role = input.RelatedRoles.get(sectionKey);
        return {
            Entity: rel.RelatedEntity,
            JoinField: join,
            SectionKey: sectionKey,
            Inclusion: role === 'Primary' ? 'Primary' : role === 'Detail' ? 'More' : 'Auto',
            Source: claimedKeys.has(key) ? 'claimed' : stockKeys.has(key) ? 'stock' : 'baked',
        };
    });

    const applicable = input.Registrations.filter((reg) => reg.Metadata.entity === '*' || reg.Metadata.entity === input.EntityName);
    let unique = 0;
    const contributions: FormCompositionContribution[] = CollapseFormPanelRegistrations(applicable).map((reg) => {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${unique++}`;
        return {
            Key: key,
            Slot: reg.Metadata.slot,
            Source: reg.Source ?? 'class',
            Title: reg.Title ?? reg.Metadata.contributionKey ?? key,
            Presentation: presentationOf(reg),
            Hidden: input.HiddenContributionKeys.has(key),
            Precedence: reg.Priority,
        };
    });

    return {
        Entity: input.EntityName,
        RecordPrimaryKey: input.RecordPrimaryKey,
        Layout: input.Layout,
        Sections: input.Panels.map((p) => ({
            Key: p.SectionKey,
            Title: p.SectionName,
            Variant: p.Variant,
            Group: groupOf(input.Groups, p.SectionKey),
            Hidden: input.HiddenSectionKeys.has(p.SectionKey),
        })),
        Related: related,
        Contributions: contributions,
        SlotsPresent: [...input.SlotsPresent],
        ChromeRuleCount: input.ChromeRuleCount,
    };
}
