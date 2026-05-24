import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import {
    addOutput, failure, getStringParam, loadComponent, loadOverride, mapToComponentStatus,
} from "./_shared";

/**
 * Promote a Pending override to Active. Flips:
 *   - target Override:                   Status='Active'
 *   - target Override's Component:       Status='Active'
 *   - prior Active sibling Override:     Status='Inactive'
 *   - prior Active sibling Component:    Status='Inactive'
 *
 * "Sibling" = same EntityID + (Scope, UserID, RoleID) tuple as the target
 * Override. The target is the row identified by the input `OverrideID`; the
 * priors are any rows currently Status='Active' at the same scope target.
 *
 * Idempotency. If the target Override is already Active, returns SUCCESS
 * with a no-op message. If it's Inactive, that's a misuse — we surface
 * NOT_PENDING so the agent / UI can ask the user what they really want.
 *
 * Inputs:
 *   - `OverrideID` (required, string) — the Pending override to activate
 *
 * Outputs:
 *   - `ComponentID` — the Component now Active
 *   - `OverrideID` — echoed for convenience
 *   - `PreviousActiveOverrideID` — the override that was demoted (or null)
 */
@RegisterClass(BaseAction, "__ActivateInteractiveFormVersion")
export class ActivateInteractiveFormVersionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const overrideID = getStringParam(params, "OverrideID");
            if (!overrideID) {
                return failure("MISSING_PARAMETER", "Parameter 'OverrideID' is required.");
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const target = await loadOverride(provider, user, overrideID);
            if (!target) {
                return failure("OVERRIDE_NOT_FOUND", `EntityFormOverride '${overrideID}' not found.`);
            }
            if (target.Status === 'Active') {
                addOutput(params, "ComponentID", target.ComponentID);
                addOutput(params, "OverrideID", target.ID);
                addOutput(params, "PreviousActiveOverrideID", null);
                return { Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({ noop: true, OverrideID: target.ID, ComponentID: target.ComponentID }) };
            }
            if (target.Status === 'Inactive') {
                return failure("NOT_PENDING",
                    `Override ${overrideID} is Inactive. Use 'Revert Interactive Form' to restore an older version, not 'Activate'.`);
            }

            // Find sibling Active overrides at the same (entity, scope target).
            const rv = RunView.FromMetadataProvider(provider);
            const scopeClause = target.Scope === 'User'
                ? `Scope='User' AND UserID='${target.UserID}'`
                : target.Scope === 'Role'
                    ? `Scope='Role' AND RoleID='${target.RoleID}'`
                    : `Scope='Global' AND UserID IS NULL AND RoleID IS NULL`;
            const priorResult = await rv.RunView<{ ID: string; ComponentID: string }>({
                EntityName: "MJ: Entity Form Overrides",
                ExtraFilter: `EntityID='${target.EntityID}' AND ${scopeClause} AND Status='Active' AND ID <> '${target.ID}'`,
                Fields: ['ID', 'ComponentID'],
                ResultType: 'simple',
            }, user);
            if (!priorResult.Success) {
                return failure("QUERY_FAILED", `Prior-active lookup failed: ${priorResult.ErrorMessage ?? 'unknown error'}`);
            }

            // Promote target's component.
            const newComponent = await loadComponent(provider, user, target.ComponentID);
            if (!newComponent) {
                return failure("COMPONENT_NOT_FOUND",
                    `Override ${overrideID} points at Component ${target.ComponentID} which no longer exists.`);
            }
            newComponent.Status = mapToComponentStatus('Active');
            const ncSaved = await newComponent.Save();
            if (!ncSaved) {
                return failure("PERSIST_FAILED",
                    `Could not flip Component to Active: ${newComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            target.Status = 'Active';
            const tSaved = await target.Save();
            if (!tSaved) {
                return failure("PERSIST_FAILED",
                    `Could not flip Override to Active: ${target.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            // Demote priors. Component AND Override flipped in lock-step.
            let firstPriorID: string | null = null;
            for (const prior of priorResult.Results ?? []) {
                if (!firstPriorID) firstPriorID = prior.ID;
                const priorO = await loadOverride(provider, user, prior.ID);
                const priorC = await loadComponent(provider, user, prior.ComponentID);
                if (priorO) {
                    priorO.Status = 'Inactive';
                    await priorO.Save();
                }
                if (priorC) {
                    priorC.Status = mapToComponentStatus('Inactive');
                    await priorC.Save();
                }
            }

            addOutput(params, "ComponentID", target.ComponentID);
            addOutput(params, "OverrideID", target.ID);
            addOutput(params, "PreviousActiveOverrideID", firstPriorID);
            return { Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    OverrideID: target.ID,
                    ComponentID: target.ComponentID,
                    PreviousActiveOverrideID: firstPriorID,
                    DemotedCount: (priorResult.Results ?? []).length,
                }) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ActivateInteractiveFormVersionAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }
}

/** Tree-shaking guard. */
export function LoadActivateInteractiveFormVersionAction(): void {
    if (false as boolean) {
        const _: unknown = ActivateInteractiveFormVersionAction;
    }
}
