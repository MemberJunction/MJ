import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView, ReadRelationshipInclusion, type EntityInfo, type EntityRelationshipInfo } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { addOutput, failure, getStringParam, ContributionScopeFilter } from "./_shared";

/**
 * Byte-compatible with CodeGenLib `angular-codegen.ts` camelCase and ng-base-forms
 * `FormSectionCamelCase`. A section key an agent reads here is one it will later write
 * as `replacesSectionKey`, and the host matches it by exact string — so a "tidier"
 * implementation here silently stops matching the form. Do not "improve" it.
 */
function sectionCamelCase(str: string): string {
    const sanitized = str.replace(/[^a-zA-Z0-9\s]/g, ' ');
    let result = sanitized
        .replace(/\s(.)/g, (_m, c: string) => c.toUpperCase())
        .replace(/\s/g, '')
        .replace(/^(.)/, (_m, c: string) => c.toLowerCase());
    if (/^\d/.test(result)) result = '_' + result;
    return result.length === 0 ? 'section' : result;
}

function stripBrackets(join: string | null | undefined): string {
    return (join ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * What a generated form emits. CodeGen writes `before-fields`, `after-fields` and
 * `after-related` into every form it produces (`angular-codegen.ts`), and
 * `mj-record-form-container` always terminates the fallback chain with `after-everything`.
 *
 * `top-area` is deliberately absent: no generated form has ever emitted it. A panel aimed
 * there falls through to the bottom of the form, so offering it as an equal choice sends
 * users to a position they did not pick.
 *
 * A hand-written custom form that replaces the template can emit a different set. That is
 * the one case this list can be wrong, and the Note says so.
 */
const GENERATED_FORM_SLOTS = ['before-fields', 'after-fields', 'after-related', 'after-everything'] as const;

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
    'form generated earlier may not match. The client snapshot (AppContext.AdditionalContext.Form) ' +
    'is authoritative when present.';

const FULL_CUSTOM_FORM_NOTE =
    'A full custom entity form is active for this entity and renders the whole body: no field ' +
    'sections, no related grids, no panel contribution and no slot. Propose a new version of the ' +
    'full form rather than a panel. The container still supplies the toolbar, Save/Delete, History ' +
    'and Record Changes, so the form body does not implement those.';

/**
 * Server-side composition of an entity's form, for agents with no browser snapshot.
 *
 * The client snapshot is the better source — it reports what a form actually rendered.
 * This reproduces the part derivable from metadata alone: field sections by CodeGen rule,
 * `DisplayInForm` related grids with their L1 inclusion, the caller's Active metadata
 * contributions, and the L3 rule count.
 *
 * Compiled `BaseFormPanel` registrations live in the browser bundle, so they are absent and
 * the `Note` says so.
 *
 * Slots are reported from {@link GENERATED_FORM_SLOTS} rather than guessed: what CodeGen
 * emits is fixed, so the set is known for every generated form without opening one. It used
 * to claim all five slots, which sent anyone choosing `top-area` to the bottom of the form
 * instead.
 */
@RegisterClass(BaseAction, "__GetFormCompositionForEntity")
export class GetFormCompositionForEntityAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = getStringParam(params, "EntityName");
            if (!entityName) return failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.");

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");

            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser — contributions are user-scoped.");

            const entity = provider.EntityByName(entityName);
            if (!entity) return failure("ENTITY_NOT_FOUND", `Entity '${entityName}' is not registered.`);

            const rv = RunView.FromMetadataProvider(provider);
            const scope = ContributionScopeFilter(entity.ID, user);
            const [rules, rows, overrides] = await Promise.all([
                rv.RunView<{ ID: string }>({
                    EntityName: "MJ: Form Chrome Rules",
                    ExtraFilter: `EntityID='${EscapeSQLString(entity.ID)}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                }, user),
                rv.RunView<ContributionRow>({
                    EntityName: "MJ: Entity Form Contributions",
                    ExtraFilter: `${scope} AND Status='Active'`,
                    Fields: ['ID', 'ContributionKey', 'Slot', 'Title', 'Name', 'Presentation', 'Precedence', 'Inclusion'],
                    ResultType: 'simple',
                }, user),
                rv.RunView<{ ID: string }>({
                    EntityName: "MJ: Entity Form Overrides",
                    ExtraFilter: `${scope} AND Status='Active'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                }, user),
            ]);

            // An active override replaces the form body, so the sections, slots and
            // contributions this action would otherwise derive describe a form nobody sees.
            const fullCustomForm = (overrides.Results ?? []).length > 0;

            const payload = {
                Entity: entity.Name,
                Layout: this.readLayout(entity),
                FullCustomForm: fullCustomForm,
                Sections: fullCustomForm ? [] : this.deriveSections(entity),
                Related: fullCustomForm ? [] : this.deriveRelated(entity),
                Contributions: fullCustomForm ? [] : (rows.Results ?? []).map(r => ({
                    Key: r.ContributionKey ?? `contribution:${r.ID}`,
                    Slot: r.Slot,
                    Source: 'metadata',
                    Title: r.Title ?? r.Name ?? r.ID,
                    Presentation: r.Presentation,
                    Hidden: r.Inclusion === 'None',
                    Precedence: r.Precedence ?? 0,
                })),
                SlotsPresent: fullCustomForm ? [] : [...GENERATED_FORM_SLOTS],
                ChromeRuleCount: (rules.Results ?? []).length,
                Note: fullCustomForm ? FULL_CUSTOM_FORM_NOTE : SERVER_DERIVATION_NOTE,
            };

            addOutput(params, "Result", payload);
            return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetFormCompositionForEntityAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
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
            Key: sectionCamelCase(title),
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
            JoinField: stripBrackets(r.RelatedEntityJoinField),
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
        const sameEntity = peers.filter(p => UUIDsEqual(p.RelatedEntityID, rel.RelatedEntityID));
        return sameEntity.length > 1
            ? sectionCamelCase(`${rel.RelatedEntity} ${stripBrackets(rel.RelatedEntityJoinField)}`)
            : sectionCamelCase(rel.RelatedEntity);
    }
}

/** The contribution columns this action reads. */
interface ContributionRow {
    ID: string;
    ContributionKey: string | null;
    Slot: string;
    Title: string | null;
    Name?: string;
    Presentation: string;
    Precedence: number;
    Inclusion: string | null;
}

export function LoadGetFormCompositionForEntityAction(): void {
    if (false as boolean) { const _: unknown = GetFormCompositionForEntityAction; }
}
