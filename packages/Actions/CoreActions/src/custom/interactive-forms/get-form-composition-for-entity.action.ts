import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView, ReadRelationshipInclusion, type EntityInfo, type EntityRelationshipInfo, type RunViewResult } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import {
    FormContributionOutranks,
    FormPanelHideSettingKey,
    FormScopeAllowedOnEntity,
    IsSelectableFormOverride,
    ParseClaimedFieldNames,
    ParseHiddenFormPanelKeys,
    type FormScope,
} from "@memberjunction/core-entities";
import { AddOutput, Failure, GetStringParam, ContributionScopeFilter } from "./_shared";
import {
    FORM_VARIANT_EXPLICIT_DEFAULT,
    FormSectionCamelCase,
    FormVariantSettingKey,
    GENERATED_FORM_CONTRIBUTION_SLOTS,
    RelatedGridSectionKey,
    ResolveContributionWriteKey,
    StripJoinFieldBrackets,
} from "@memberjunction/interactive-component-types/forms";

/** An override row, as far as the rendered-form question needs it. */
interface OverrideRow {
    ID: string;
    Status: string;
    Scope: FormScope;
}

/** One `MJ: User Settings` row this action reads. */
interface SettingRow {
    Setting: string;
    Value: string | null;
}

/** One field section as this action derives it, with the inputs it would draw. */
interface DerivedFormSection {
    Key: string;
    Title: string;
    Variant: string;
    Group: null;
    Hidden: false;
    Fields: Array<{ Name: string; Label: string }>;
}

const SERVER_DERIVATION_NOTE =
    'Derived from metadata on the server. Compiled BaseFormPanel contributions exist only in the ' +
    'browser and are not listed. SlotsPresent is what CodeGen emits plus the container terminator; ' +
    'a hand-written custom form can differ. Section keys and field names come from current field ' +
    'metadata, which a ' +
    'form generated earlier may not match. The client form context (AppContext.AdditionalContext.Form), ' +
    'when present, lists the sections the open form actually draws and is authoritative for those.';

const FULL_CUSTOM_FORM_NOTE =
    'A full custom entity form is the one THIS USER sees for this entity, and it renders the whole ' +
    'body: no field sections, no related grids, no panel contribution and no slot. Propose a new ' +
    'version of the full form rather than a panel. The container still supplies the toolbar, ' +
    'Save/Delete, History and Record Changes, so the form body does not implement those. The user ' +
    'can switch to the generated form from the form picker in the toolbar, and a panel becomes ' +
    'possible again the moment they do.';

/**
 * Server-side composition of an entity's form, for agents with no browser snapshot.
 *
 * The client context is the better source for sections — it reports what a form actually
 * rendered. This reproduces the part derivable from metadata alone: field sections by CodeGen
 * rule, `DisplayInForm` related grids with their L1 inclusion, the caller's Active metadata
 * contributions as the caller's form draws them, and the L3 rule count.
 *
 * Contributions are reported for the form this user sees: one row per key (highest
 * `Precedence`, then the narrower scope, the browser's collapse rule), the panels the user hid
 * marked `Hidden`, and on an identity or permission entity only the user's own rows
 * ({@link FormScopeAllowedOnEntity}). Any failed query returns `QUERY_FAILED` rather than an
 * answer built from a partial read.
 *
 * Compiled `BaseFormPanel` registrations live in the browser bundle, so they are absent and
 * the `Note` says so.
 *
 * Slots are reported from `GENERATED_FORM_CONTRIBUTION_SLOTS` rather than guessed: what CodeGen
 * emits is fixed, so the set is known for every generated form without opening one. A
 * hand-written custom form can emit a different set, and the `Note` says so.
 */
@RegisterClass(BaseAction, "__GetFormCompositionForEntity")
export class GetFormCompositionForEntityAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = GetStringParam(params, "EntityName");
            if (!entityName) return Failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.");

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");

            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser — contributions are user-scoped.");

            const entity = provider.EntityByName(entityName);
            if (!entity) return Failure("ENTITY_NOT_FOUND", `Entity '${entityName}' is not registered.`);

            const rv = RunView.FromMetadataProvider(provider);
            const scope = ContributionScopeFilter(entity.ID, user);
            const variantKey = FormVariantSettingKey(entity.Name);
            const hideKey = FormPanelHideSettingKey(entity.Name);
            const [rules, rows, overrides, settings] = await Promise.all([
                rv.RunView<{ ID: string }>({
                    EntityName: "MJ: Form Chrome Rules",
                    ExtraFilter: `EntityID='${EscapeSQLString(entity.ID)}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                }, user),
                rv.RunView<ContributionRow>({
                    EntityName: "MJ: Entity Form Contributions",
                    ExtraFilter: `${scope} AND Status='Active'`,
                    Fields: ['ID', 'ContributionKey', 'Scope', 'Slot', 'Title', 'Name', 'Presentation', 'Precedence', 'Inclusion', 'SortKey',
                        'InSectionKey', 'SectionPosition', 'ReplacesFieldNames', 'ReplacesSectionKey', 'ReplacesSectionKeys',
                        'RelatedEntityID', 'RelatedEntity', 'RelatedJoinField'],
                    OrderBy: 'Precedence DESC, SortKey DESC',
                    ResultType: 'simple',
                }, user),
                rv.RunView<OverrideRow>({
                    EntityName: "MJ: Entity Form Overrides",
                    ExtraFilter: `${scope} AND Status<>'Pending'`,
                    Fields: ['ID', 'Status', 'Scope'],
                    ResultType: 'simple',
                }, user),
                rv.RunView<SettingRow>({
                    EntityName: "MJ: User Settings",
                    ExtraFilter: `UserID='${EscapeSQLString(user.ID)}' AND Setting IN ('${EscapeSQLString(variantKey)}','${EscapeSQLString(hideKey)}')`,
                    Fields: ['Setting', 'Value'],
                    ResultType: 'simple',
                }, user),
            ]);
            const failed = firstFailure([
                ["MJ: Form Chrome Rules", rules], ["MJ: Entity Form Contributions", rows],
                ["MJ: Entity Form Overrides", overrides], ["MJ: User Settings", settings],
            ]);
            if (failed) return Failure("QUERY_FAILED", failed);

            // Which form the CALLER sees, not merely whether a custom one exists. They can
            // pick any form on offer, the generated one included, and that pick is a
            // per-user setting — reading only the override rows answered for a form the
            // user may have switched away from, and refused a panel on the form they were
            // looking at.
            const offered = (overrides.Results ?? []).filter(o => FormScopeAllowedOnEntity(entity.Name, o.Scope));
            const fullCustomForm = this.rendersFullCustomForm(offered, settingValue(settings.Results ?? [], variantKey));
            const hidden = new Set(ParseHiddenFormPanelKeys(settingValue(settings.Results ?? [], hideKey)));
            const applicable = (rows.Results ?? []).filter(r => FormScopeAllowedOnEntity(entity.Name, r.Scope));

            const payload = {
                Entity: entity.Name,
                Layout: this.readLayout(entity),
                FullCustomForm: fullCustomForm,
                Sections: fullCustomForm ? [] : this.deriveSections(entity),
                Related: fullCustomForm ? [] : this.deriveRelated(entity),
                Contributions: fullCustomForm ? [] : contributionsUserSees(applicable, hidden),
                SlotsPresent: fullCustomForm ? [] : [...GENERATED_FORM_CONTRIBUTION_SLOTS],
                ChromeRuleCount: (rules.Results ?? []).length,
                Note: fullCustomForm ? FULL_CUSTOM_FORM_NOTE : SERVER_DERIVATION_NOTE,
            };

            AddOutput(params, "Result", payload);
            return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetFormCompositionForEntityAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }

    /**
     * Whether a full custom form renders for this caller.
     *
     * Mirrors `FormResolverService.pickActive` in the browser, which is what actually
     * decides. A stored pick wins when the user may pick it: an Active form, or their own
     * form set aside by a later apply ({@link IsSelectableFormOverride}). The explicit-default sentinel
     * means they asked for the generated form, so no custom form renders at all. With no
     * pick, or a pick naming a form that has gone or cannot be picked, the auto-pick rule
     * applies: the first Active override, if there is one.
     */
    private rendersFullCustomForm(overrides: readonly OverrideRow[], preference: string | null): boolean {
        const selected = (preference ?? '').trim();
        if (selected === FORM_VARIANT_EXPLICIT_DEFAULT) return false;
        if (selected && overrides.some(o => IsSelectableFormOverride(o) && UUIDsEqual(o.ID, selected))) return true;
        return overrides.some(o => o.Status === 'Active');
    }

    private readLayout(entity: EntityInfo): 'accordion' | 'left-nav' {
        const configured = (entity as { ConfigurationObject?: { UI?: { Form?: { Layout?: string } } } })
            .ConfigurationObject?.UI?.Form?.Layout;
        return configured === 'left-nav' ? 'left-nav' : 'accordion';
    }

    /**
     * Field sections, by CodeGen's own rule: a field marked `Category` groups under its
     * category title, everything else lands in Details, and primary-key / `__mj_` audit
     * fields form System Metadata, which CodeGen always emits last.
     */
    private deriveSections(entity: EntityInfo): DerivedFormSection[] {
        const fieldsByTitle = new Map<string, Array<{ Name: string; Label: string }>>();
        const titleOrder: string[] = [];
        const fileUnder = (title: string, field: { Name: string; Label: string }): void => {
            if (!fieldsByTitle.has(title)) {
                fieldsByTitle.set(title, []);
                titleOrder.push(title);
            }
            fieldsByTitle.get(title)!.push(field);
        };

        for (const f of entity.Fields) {
            if (f.Name.startsWith('__mj_') || f.Name === 'ID') continue;
            const category = (f as { Category?: string | null }).Category?.trim();
            const type = (f as { GeneratedFormSectionType?: string | null }).GeneratedFormSectionType;
            const field = { Name: f.Name, Label: f.DisplayNameOrName };
            fileUnder(type === 'Category' && category ? category : 'Details', field);
        }

        const ordered = [
            ...(fieldsByTitle.has('Details') ? ['Details'] : []),
            ...titleOrder.filter(t => t !== 'Details'),
            'System Metadata',
        ];
        return ordered.map(title => ({
            Key: FormSectionCamelCase(title),
            Title: title,
            Variant: 'default',
            Group: null,
            Hidden: false,
            // Named so a contribution can stand in for one field rather than the whole
            // section. Metadata-derived, so these are the entity's fields rather than the
            // ones a form generated earlier actually draws — SERVER_DERIVATION_NOTE says so.
            Fields: fieldsByTitle.get(title) ?? [],
        }));
    }

    /**
     * Related grids the form shows, in the order it shows them. IS-A children are excluded:
     * they share the parent's key and render as part of the record, not as a grid beside it.
     */
    private deriveRelated(entity: EntityInfo): Array<{ Entity: string; JoinField: string; SectionKey: string; Inclusion: string; Source: 'baked' }> {
        const isaChildIDs = (entity.ChildEntities ?? []).map(c => c.ID);
        const visible = entity.RelatedEntities
            .filter(r => r.DisplayInForm && !isaChildIDs.some(id => UUIDsEqual(id, r.RelatedEntityID)))
            .sort((a, b) => (a.Sequence ?? 999999) - (b.Sequence ?? 999999) || a.RelatedEntity.localeCompare(b.RelatedEntity));

        return visible.map(r => ({
            Entity: r.RelatedEntity,
            JoinField: StripJoinFieldBrackets(r.RelatedEntityJoinField),
            SectionKey: this.relatedSectionKey(r, visible),
            Inclusion: ReadRelationshipInclusion(r.Configuration) ?? 'Auto',
            Source: 'baked' as const,
        }));
    }

    /**
     * Two relationships to the same entity (Bill-To and Ship-To, say) would collide on a
     * bare entity-name key, so those are disambiguated by join field — matching what the
     * form itself does.
     */
    private relatedSectionKey(rel: EntityRelationshipInfo, peers: readonly EntityRelationshipInfo[]): string {
        const sharesRelatedEntity = peers.filter(p => UUIDsEqual(p.RelatedEntityID, rel.RelatedEntityID)).length > 1;
        return RelatedGridSectionKey(rel.RelatedEntity, rel.RelatedEntityJoinField, sharesRelatedEntity);
    }
}

/** The message for the first failed query, or null when every query succeeded. */
function firstFailure(results: ReadonlyArray<[string, RunViewResult]>): string | null {
    const failed = results.find(([, result]) => !result.Success);
    if (!failed) return null;
    const [entityName, result] = failed;
    return `Could not read the form's composition: the ${entityName} lookup failed (${result.ErrorMessage || 'unknown error'}).`;
}

/** The stored value of one setting. Keys are matched case-insensitively, as the database compares them. */
function settingValue(rows: readonly SettingRow[], key: string): string | null {
    return rows.find(r => (r.Setting ?? '').toLowerCase() === key.toLowerCase())?.Value ?? null;
}

/** The key a row is collapsed and hidden by, as the browser derives it; null for a row with none. */
function contributionRowKey(row: ContributionRow): string | null {
    return ResolveContributionWriteKey(
        { contributionKey: row.ContributionKey ?? undefined, relatedJoinField: row.RelatedJoinField ?? undefined },
        row.RelatedEntity ?? null,
    );
}

/** One row per key, the one {@link FormContributionOutranks} picks; rows without a key never collapse. */
function collapseByKey(rows: readonly ContributionRow[]): ContributionRow[] {
    const winners = new Map<string, ContributionRow>();
    let unique = 0;
    for (const row of rows) {
        const key = contributionRowKey(row) ?? `__unique:${unique++}`;
        const incumbent = winners.get(key);
        if (!incumbent || FormContributionOutranks(row, incumbent)) winners.set(key, row);
    }
    return [...winners.values()];
}

/**
 * The contributions on the form this user sees.
 *
 * A panel the user hid is out of the collapse, so a row it outranked can draw in its place, as
 * in the browser. The user's own rows are never hidden. A hidden panel whose key nothing else
 * draws is still listed, marked `Hidden`, because it holds that key.
 */
function contributionsUserSees(rows: readonly ContributionRow[], hiddenKeys: ReadonlySet<string>) {
    const isHidden = (row: ContributionRow): boolean => {
        if (row.Scope === 'User') return false;
        const key = contributionRowKey(row);
        return !!key && hiddenKeys.has(key);
    };
    const drawn = collapseByKey(rows.filter(r => !isHidden(r)));
    const drawnKeys = new Set(drawn.map(contributionRowKey).filter((k): k is string => !!k));
    const hiddenOnly = collapseByKey(rows.filter(isHidden)).filter(r => !drawnKeys.has(contributionRowKey(r) ?? ''));
    return [
        ...drawn.map(r => contributionSummary(r, r.Inclusion === 'None')),
        ...hiddenOnly.map(r => contributionSummary(r, true)),
    ];
}

function contributionSummary(r: ContributionRow, hidden: boolean) {
    return {
        Key: contributionRowKey(r) ?? `contribution:${r.ID}`,
        Slot: r.Slot,
        Source: 'metadata',
        Title: r.Title ?? r.Name ?? r.ID,
        Presentation: r.Presentation,
        Hidden: hidden,
        Precedence: r.Precedence ?? 0,
        SortKey: r.SortKey ?? 0,
        InSectionKey: r.InSectionKey ?? undefined,
        SectionPosition: r.SectionPosition ?? undefined,
        FieldNames: ParseClaimedFieldNames(r.ReplacesFieldNames),
        SectionKeys: replacedSectionKeyList(r),
        ReplacesPlace: !!(r.ReplacesSectionKey || r.ReplacesSectionKeys || r.RelatedEntityID),
    };
}

/** The blocks a row stands in for: the list when set, else the single key. */
function replacedSectionKeyList(row: Pick<ContributionRow, 'ReplacesSectionKey' | 'ReplacesSectionKeys'>): string[] {
    const listed = ParseClaimedFieldNames(row.ReplacesSectionKeys);
    if (listed.length > 0) return listed;
    const single = (row.ReplacesSectionKey ?? '').trim();
    return single ? [single] : [];
}

/** The contribution columns this action reads. */
interface ContributionRow {
    ID: string;
    ContributionKey: string | null;
    Scope: FormScope;
    Slot: string;
    Title: string | null;
    Name?: string;
    Presentation: string;
    Precedence: number;
    Inclusion: string | null;
    SortKey: number | null;
    InSectionKey: string | null;
    SectionPosition: 'start' | 'end' | null;
    ReplacesFieldNames: string | null;
    ReplacesSectionKey: string | null;
    ReplacesSectionKeys: string | null;
    RelatedEntityID: string | null;
    RelatedEntity?: string | null;
    RelatedJoinField?: string | null;
}

export function LoadGetFormCompositionForEntityAction(): void {
    if (false as boolean) { const _: unknown = GetFormCompositionForEntityAction; }
}
