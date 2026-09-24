import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import type { MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import { ParseClaimedFieldNames, AddOutput, Failure, GetStringParam } from "./_shared";

/** One contribution row, flattened for an agent or an apply flow to reason about. */
export interface FormContributionSummary {
    ContributionID: string;
    ComponentID: string;
    ComponentName: string | null;
    ComponentVersion: string | null;
    Name: string;
    Scope: string;
    Status: string;
    Precedence: number;
    Slot: string;
    ContributionKey: string | null;
    RelatedEntity: string | null;
    RelatedJoinField: string | null;
    ReplacesSectionKey: string | null;
    ReplacesFieldNames: string[];
    Inclusion: string | null;
    Presentation: string;
    Title: string | null;
}

/**
 * Read-only: every `MJ: Entity Form Contributions` row that applies to (entity, caller),
 * in every status, so an apply flow or agent can decide Create vs Modify and see what
 * already exists. Companion of `Get Active Form For Entity`.
 *
 * Sorted Active first, then Pending, then Inactive; within a status, highest `Precedence`
 * then highest `SortKey` — the order the renderer resolves them in.
 */
@RegisterClass(BaseAction, "__GetFormContributionsForEntity")
export class GetFormContributionsForEntityAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = GetStringParam(params, "EntityName");
            if (!entityName) return Failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.");
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser.");
            const entity = provider.EntityByName(entityName);
            if (!entity) return Failure("ENTITY_NOT_FOUND", `Entity '${entityName}' is not registered.`);

            const rv = RunView.FromMetadataProvider(provider);
            const rows = await rv.RunView<MJEntityFormContributionEntity>({
                EntityName: "MJ: Entity Form Contributions",
                ExtraFilter: this.applicableFilter(entity.ID, user),
                OrderBy: "Precedence DESC, SortKey DESC",
                ResultType: 'entity_object',
            }, user);
            if (!rows.Success) return Failure("QUERY_FAILED", rows.ErrorMessage ?? 'Contribution lookup failed.');

            const components = await this.loadComponentLabels(rv, rows.Results ?? [], user);

            const statusRank = (s: string): number => (s === 'Active' ? 0 : s === 'Pending' ? 1 : 2);
            const summaries: FormContributionSummary[] = (rows.Results ?? [])
                .slice()
                .sort((a, b) => statusRank(a.Status) - statusRank(b.Status) || (b.Precedence ?? 0) - (a.Precedence ?? 0))
                .map(r => {
                    const component = components.get(r.ComponentID.toLowerCase());
                    return {
                        ContributionID: r.ID, ComponentID: r.ComponentID,
                        ComponentName: component?.Name ?? null,
                        ComponentVersion: component?.Version ?? null,
                        Name: r.Name, Scope: r.Scope, Status: r.Status, Precedence: r.Precedence ?? 0, Slot: r.Slot,
                        ContributionKey: r.ContributionKey, RelatedEntity: r.RelatedEntity,
                        RelatedJoinField: r.RelatedJoinField, ReplacesSectionKey: r.ReplacesSectionKey,
                        ReplacesFieldNames: ParseClaimedFieldNames(r.ReplacesFieldNames),
                        Inclusion: r.Inclusion, Presentation: r.Presentation, Title: r.Title,
                    };
                });

            const payload = { EntityName: entity.Name, Contributions: summaries };
            AddOutput(params, "Result", payload);
            return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetFormContributionsForEntityAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }

    /** Rows the caller can see: their own User rows, their roles' rows, and Global rows. */
    private applicableFilter(entityID: string, user: NonNullable<RunActionParams['ContextUser']>): string {
        const roleIDs = ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? [])
            .map(r => r.RoleID).filter((x): x is string => !!x);
        const roleClause = roleIDs.length > 0
            ? `(Scope='Role' AND RoleID IN (${roleIDs.map(id => `'${EscapeSQLString(id)}'`).join(',')}))`
            : `(1=0)`;
        return `EntityID='${EscapeSQLString(entityID)}' AND ((Scope='User' AND UserID='${EscapeSQLString(user.ID)}') OR ${roleClause} OR Scope='Global')`;
    }

    /** Component name + version for each distinct ComponentID, in one query. */
    private async loadComponentLabels(
        rv: RunView,
        rows: readonly MJEntityFormContributionEntity[],
        user: NonNullable<RunActionParams['ContextUser']>,
    ): Promise<Map<string, { Name: string; Version: string }>> {
        const components = new Map<string, { Name: string; Version: string }>();
        const componentIDs = [...new Set(rows.map(r => r.ComponentID))];
        if (componentIDs.length === 0) return components;
        const comps = await rv.RunView<{ ID: string; Name: string; Version: string }>({
            EntityName: "MJ: Components",
            ExtraFilter: `ID IN (${componentIDs.map(id => `'${EscapeSQLString(id)}'`).join(',')})`,
            Fields: ['ID', 'Name', 'Version'], ResultType: 'simple',
        }, user);
        for (const c of comps.Results ?? []) {
            components.set(c.ID.toLowerCase(), { Name: c.Name, Version: c.Version });
        }
        return components;
    }
}

export function LoadGetFormContributionsForEntityAction(): void {
    if (false as boolean) { const _: unknown = GetFormContributionsForEntityAction; }
}
