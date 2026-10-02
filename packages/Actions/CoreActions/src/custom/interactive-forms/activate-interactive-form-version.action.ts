import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import {
    AddOutput, CheckOverrideOwnership, Failure, GetStringParam, LoadComponent, LoadOverride, MapToComponentStatus,
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
            const overrideID = GetStringParam(params, "OverrideID");
            if (!overrideID) {
                return Failure("MISSING_PARAMETER", "Parameter 'OverrideID' is required.");
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser.");

            const target = await LoadOverride(provider, user, overrideID);
            if (!target) {
                return Failure("OVERRIDE_NOT_FOUND", `EntityFormOverride '${overrideID}' not found.`);
            }
            const ownershipFail = CheckOverrideOwnership(target, user);
            if (ownershipFail) return ownershipFail;
            if (target.Status === 'Active') {
                AddOutput(params, "ComponentID", target.ComponentID);
                AddOutput(params, "OverrideID", target.ID);
                AddOutput(params, "PreviousActiveOverrideID", null);
                return { Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({ noop: true, OverrideID: target.ID, ComponentID: target.ComponentID }) };
            }
            if (target.Status === 'Inactive') {
                return Failure("NOT_PENDING",
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
                return Failure("QUERY_FAILED", `Prior-active lookup failed: ${priorResult.ErrorMessage ?? 'unknown error'}`);
            }

            // Promote target's component.
            const newComponent = await LoadComponent(provider, user, target.ComponentID);
            if (!newComponent) {
                return Failure("COMPONENT_NOT_FOUND",
                    `Override ${overrideID} points at Component ${target.ComponentID} which no longer exists.`);
            }
            newComponent.Status = MapToComponentStatus('Active');
            const ncSaved = await newComponent.Save();
            if (!ncSaved) {
                return Failure("PERSIST_FAILED",
                    `Could not flip Component to Active: ${newComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            target.Status = 'Active';
            const tSaved = await target.Save();
            if (!tSaved) {
                return Failure("PERSIST_FAILED",
                    `Could not flip Override to Active: ${target.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            // Demote priors. Component AND Override flipped in lock-step.
            let firstPriorID: string | null = null;
            for (const prior of priorResult.Results ?? []) {
                if (!firstPriorID) firstPriorID = prior.ID;
                const priorO = await LoadOverride(provider, user, prior.ID);
                const priorC = await LoadComponent(provider, user, prior.ComponentID);
                if (priorO) {
                    priorO.Status = 'Inactive';
                    await priorO.Save();
                }
                if (priorC) {
                    priorC.Status = MapToComponentStatus('Inactive');
                    await priorC.Save();
                }
            }

            AddOutput(params, "ComponentID", target.ComponentID);
            AddOutput(params, "OverrideID", target.ID);
            AddOutput(params, "PreviousActiveOverrideID", firstPriorID);
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
            return Failure("UNEXPECTED_ERROR", message);
        }
    }
}

/** Tree-shaking guard. */
export function LoadActivateInteractiveFormVersionAction(): void {
    if (false as boolean) {
        const _: unknown = ActivateInteractiveFormVersionAction;
    }
}
