import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView, RunInEntityTransaction } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import type { MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import {
    addOutput, checkScopedOwnership, failure, getStringParam, loadComponent, loadContribution,
    mapToComponentStatus, CONTRIBUTION_KEY_PATTERN,
} from "./_shared";

/** The shape `RunInEntityTransaction` needs; providers that lack it run the work untransacted. */
type TransactableProvider = Parameters<typeof RunInEntityTransaction>[0];

/** A prior Active sibling this activation will demote. */
interface PriorActive {
    ID: string;
    ComponentID: string;
}

/**
 * Promote a Pending contribution to Active and demote the sibling that shares its
 * (EntityID, ContributionKey, scope) tuple.
 *
 * A row with no ContributionKey is unique by construction and has no sibling to demote.
 * Activating a row that is already Active is a no-op success, so the apply flow can retry
 * safely. An Inactive row returns `NOT_PENDING` — branch a new Pending version from it
 * with `Modify Form Contribution` first.
 */
@RegisterClass(BaseAction, "__ActivateFormContributionVersion")
export class ActivateFormContributionVersionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contributionID = getStringParam(params, "ContributionID");
            if (!contributionID) return failure("MISSING_PARAMETER", "Parameter 'ContributionID' is required.");
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const target = await loadContribution(provider, user, contributionID);
            if (!target) return failure("CONTRIBUTION_NOT_FOUND", `Contribution '${contributionID}' not found.`);
            const forbidden = checkScopedOwnership(target, user, 'Contribution');
            if (forbidden) return forbidden;

            if (target.Status === 'Active') {
                addOutput(params, "ContributionID", target.ID);
                addOutput(params, "ComponentID", target.ComponentID);
                addOutput(params, "PreviousActiveContributionID", null);
                return {
                    Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({ noop: true, ContributionID: target.ID, ComponentID: target.ComponentID }),
                };
            }
            if (target.Status === 'Inactive') {
                return failure("NOT_PENDING",
                    `Contribution ${contributionID} is Inactive. Modify it with a version bump to branch a new Pending version first.`);
            }

            const priors = await this.findPriorActive(params, target);
            if ('error' in priors) return priors.error;

            const component = await loadComponent(provider, user, target.ComponentID);
            if (!component) {
                return failure("COMPONENT_NOT_FOUND",
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
                        const priorRow = await loadContribution(provider, user, prior.ID);
                        const priorComponent = await loadComponent(provider, user, prior.ComponentID);
                        if (priorRow) {
                            priorRow.Status = 'Inactive';
                            if (!(await priorRow.Save())) {
                                throw new Error(`Could not demote prior contribution ${prior.ID}: ${priorRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                            }
                        }
                        if (priorComponent) {
                            priorComponent.Status = mapToComponentStatus('Inactive');
                            await priorComponent.Save();
                        }
                    }
                    component.Status = mapToComponentStatus('Active');
                    if (!(await component.Save())) {
                        throw new Error(`Could not flip Component to Published: ${component.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                    target.Status = 'Active';
                    if (!(await target.Save())) {
                        throw new Error(`Could not flip Contribution to Active: ${target.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                });
            } catch (err) {
                return failure("PERSIST_FAILED", err instanceof Error ? err.message : String(err));
            }

            addOutput(params, "ContributionID", target.ID);
            addOutput(params, "ComponentID", target.ComponentID);
            addOutput(params, "PreviousActiveContributionID", firstPriorID);
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
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    /** Active rows sharing the target's key and scope. Empty for a keyless row. */
    private async findPriorActive(
        params: RunActionParams,
        target: MJEntityFormContributionEntity,
    ): Promise<{ rows: PriorActive[] } | { error: ActionResultSimple }> {
        if (!target.ContributionKey) return { rows: [] };
        // Keys are constrained on write (CONTRIBUTION_KEY_PATTERN), so a stored key cannot
        // contain a quote. Re-assert it rather than trusting the write path alone: a row that
        // predates the constraint should fail loudly, not build a filter.
        if (!CONTRIBUTION_KEY_PATTERN.test(target.ContributionKey)) {
            return { error: failure("INVALID_CONTRIBUTION_KEY",
                `Stored contribution key '${target.ContributionKey}' is not a legal key.`) };
        }
        const scopeClause = target.Scope === 'User'
            ? `Scope='User' AND UserID='${EscapeSQLString(target.UserID ?? '')}'`
            : target.Scope === 'Role'
                ? `Scope='Role' AND RoleID='${EscapeSQLString(target.RoleID ?? '')}'`
                : `Scope='Global' AND UserID IS NULL AND RoleID IS NULL`;
        const rv = RunView.FromMetadataProvider(params.Provider ?? Metadata.Provider);
        const result = await rv.RunView<PriorActive>({
            EntityName: "MJ: Entity Form Contributions",
            ExtraFilter: `EntityID='${EscapeSQLString(target.EntityID)}' AND ContributionKey='${EscapeSQLString(target.ContributionKey)}' AND ${scopeClause} AND Status='Active' AND ID <> '${EscapeSQLString(target.ID)}'`,
            Fields: ['ID', 'ComponentID'], ResultType: 'simple',
        }, params.ContextUser);
        if (!result.Success) {
            return { error: failure("QUERY_FAILED",
                `Prior-active lookup failed: ${result.ErrorMessage ?? 'unknown error'}`) };
        }
        return { rows: result.Results ?? [] };
    }
}

export function LoadActivateFormContributionVersionAction(): void {
    if (false as boolean) { const _: unknown = ActivateFormContributionVersionAction; }
}
