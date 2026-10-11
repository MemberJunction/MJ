import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView, RunInEntityTransaction } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import { ActiveContributionSiblings, type FormScopedRow, type MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import { CONTRIBUTION_KEY_PATTERN } from "@memberjunction/interactive-component-types/forms";
import {
    AddOutput,
    CheckPersonalWrite,
    Failure,
    GetStringParam,
    LoadComponent,
    LoadContribution,
    MapToComponentStatus,
    type TransactableProvider,
} from "./_shared";

/** A prior Active sibling this activation will demote. */
interface PriorActive extends FormScopedRow {
    ComponentID: string;
}

/**
 * Promote one of the caller's own Pending contributions to Active and demote the caller's Active
 * row that shares its EntityID and ContributionKey.
 *
 * Only the caller's own User-scope rows can be activated; a Role or Global row, or another user's
 * row, returns `FORBIDDEN` (shared panels are managed from the form's Manage drawer or Form
 * Builder). A row with no ContributionKey is unique by construction and has no sibling to demote.
 * Activating a row that is already Active is a no-op success, so the apply flow can retry
 * safely. An Inactive row returns `NOT_PENDING` — branch a new Pending version from it
 * with `Modify Form Contribution` first.
 */
@RegisterClass(BaseAction, "__ActivateFormContributionVersion")
export class ActivateFormContributionVersionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contributionID = GetStringParam(params, "ContributionID");
            if (!contributionID) return Failure("MISSING_PARAMETER", "Parameter 'ContributionID' is required.");
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser.");

            const target = await LoadContribution(provider, user, contributionID);
            if (!target) return Failure("CONTRIBUTION_NOT_FOUND", `Contribution '${contributionID}' not found.`);
            const forbidden = CheckPersonalWrite(target, user);
            if (forbidden) return forbidden;

            if (target.Status === 'Active') {
                AddOutput(params, "ContributionID", target.ID);
                AddOutput(params, "ComponentID", target.ComponentID);
                AddOutput(params, "PreviousActiveContributionID", null);
                return {
                    Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({ noop: true, ContributionID: target.ID, ComponentID: target.ComponentID }),
                };
            }
            if (target.Status === 'Inactive') {
                return Failure("NOT_PENDING",
                    `Contribution ${contributionID} is Inactive. Modify it with a version bump to branch a new Pending version first.`);
            }

            const priors = await this.findPriorActive(params, target);
            if ('error' in priors) return priors.error;

            const component = await LoadComponent(provider, user, target.ComponentID);
            if (!component) {
                return Failure("COMPONENT_NOT_FOUND",
                    `Contribution ${contributionID} points at Component ${target.ComponentID} which no longer exists.`);
            }

            // Demote BEFORE promoting. `UQ_EntityFormContribution_Key` is unique over
            // (EntityID, ContributionKey, Scope, UserID, RoleID) filtered to Status='Active',
            // so promoting first means two Active rows share the key for one statement and the
            // index refuses the write. Both steps run in one transaction where the provider
            // supports it, so a failure mid-way cannot leave the form with no Active row.
            let firstPriorID: string | null = null;
            try {
                await RunInEntityTransaction(provider as TransactableProvider, async () => {
                    for (const prior of priors.rows) {
                        firstPriorID ??= prior.ID;
                        const priorRow = await LoadContribution(provider, user, prior.ID);
                        const priorComponent = await LoadComponent(provider, user, prior.ComponentID);
                        if (priorRow) {
                            priorRow.Status = 'Inactive';
                            if (!(await priorRow.Save())) {
                                throw new Error(`Could not demote prior contribution ${prior.ID}: ${priorRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                            }
                        }
                        if (priorComponent) {
                            priorComponent.Status = MapToComponentStatus('Inactive');
                            if (!(await priorComponent.Save())) {
                                throw new Error(`Could not deprecate prior component ${prior.ComponentID}: ${priorComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                            }
                        }
                    }
                    component.Status = MapToComponentStatus('Active');
                    if (!(await component.Save())) {
                        throw new Error(`Could not flip Component to Published: ${component.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                    target.Status = 'Active';
                    if (!(await target.Save())) {
                        throw new Error(`Could not flip Contribution to Active: ${target.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                });
            } catch (err) {
                return Failure("PERSIST_FAILED", err instanceof Error ? err.message : String(err));
            }

            AddOutput(params, "ContributionID", target.ID);
            AddOutput(params, "ComponentID", target.ComponentID);
            AddOutput(params, "PreviousActiveContributionID", firstPriorID);
            return {
                Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    ContributionID: target.ID, ComponentID: target.ComponentID,
                    PreviousActiveContributionID: firstPriorID, DemotedCount: priors.rows.length,
                }),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ActivateFormContributionVersionAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }

    /**
     * The Active rows sharing the target's key and audience, which `ActiveContributionSiblings`
     * decides, as the Manage drawer does. Empty for a keyless row.
     */
    private async findPriorActive(
        params: RunActionParams,
        target: MJEntityFormContributionEntity,
    ): Promise<{ rows: PriorActive[] } | { error: ActionResultSimple }> {
        if (!target.ContributionKey) return { rows: [] };
        // Keys are constrained on write (CONTRIBUTION_KEY_PATTERN), so a stored key cannot
        // contain a quote. Re-assert it rather than trusting the write path alone: a row that
        // predates the constraint should fail loudly, not build a filter.
        if (!CONTRIBUTION_KEY_PATTERN.test(target.ContributionKey)) {
            return { error: Failure("INVALID_CONTRIBUTION_KEY",
                `Stored contribution key '${target.ContributionKey}' is not a legal key.`) };
        }
        const rv = RunView.FromMetadataProvider(params.Provider ?? Metadata.Provider);
        const result = await rv.RunView<PriorActive>({
            EntityName: "MJ: Entity Form Contributions",
            ExtraFilter: `EntityID='${EscapeSQLString(target.EntityID)}' AND ContributionKey='${EscapeSQLString(target.ContributionKey)}' AND Status='Active'`,
            Fields: ['ID', 'EntityID', 'Status', 'Scope', 'UserID', 'RoleID', 'ContributionKey', 'ComponentID'],
            ResultType: 'simple',
        }, params.ContextUser);
        if (!result.Success) {
            return { error: Failure("QUERY_FAILED",
                `Prior-active lookup failed: ${result.ErrorMessage ?? 'unknown error'}`) };
        }
        return { rows: ActiveContributionSiblings(result.Results ?? [], target) };
    }
}

export function LoadActivateFormContributionVersionAction(): void {
    if (false as boolean) { const _: unknown = ActivateFormContributionVersionAction; }
}
