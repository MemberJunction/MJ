import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import {
    AddOutput, CheckPersonalWrite, Failure, GetStringParam, LoadComponent, LoadOverride, MapToComponentStatus,
    WriteAtomically,
} from "./_shared";

/**
 * Promote a Pending override to Active. Flips:
 *   - target Override:                   Status='Active'
 *   - target Override's Component:       Status='Active'
 *   - prior Active sibling Override:     Status='Inactive'
 *   - prior Active sibling Component:    Status='Inactive'
 *
 * "Sibling" = another of the caller's User-scope overrides on the same
 * EntityID that is currently Status='Active'. The target is the row identified
 * by the input `OverrideID`.
 *
 * Only the caller's own User-scope overrides can be activated. A Role or Global
 * override, or another user's, returns FORBIDDEN for every caller (see
 * `CheckPersonalWrite` in `_shared.ts`): shared forms are managed from Form
 * Builder or the form's Manage drawer. The target's Component and Override flip
 * to Active in one entity transaction. The prior Active sibling is set aside after
 * that transaction; if one of those saves fails, the action returns
 * `PERSIST_FAILED` and the target stays Active.
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
            const ownershipFail = CheckPersonalWrite(target, user);
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

            // Find the caller's other Active overrides on this entity.
            const rv = RunView.FromMetadataProvider(provider);
            const priorResult = await rv.RunView<{ ID: string; ComponentID: string }>({
                EntityName: "MJ: Entity Form Overrides",
                ExtraFilter: `EntityID='${EscapeSQLString(target.EntityID)}' AND Scope='User' AND UserID='${EscapeSQLString(target.UserID ?? '')}' AND Status='Active' AND ID <> '${EscapeSQLString(target.ID)}'`,
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
            const promoted = await WriteAtomically(provider, async () => {
                newComponent.Status = MapToComponentStatus('Active');
                if (!(await newComponent.Save())) {
                    return { error: Failure("PERSIST_FAILED",
                        `Could not flip Component to Active: ${newComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`) };
                }
                target.Status = 'Active';
                if (!(await target.Save())) {
                    return { error: Failure("PERSIST_FAILED",
                        `Could not flip Override to Active: ${target.LatestResult?.CompleteMessage ?? 'unknown error'}`) };
                }
                return { ok: true };
            });
            if ('error' in promoted) return promoted.error;

            // Demote priors. Component AND Override flipped in lock-step.
            let firstPriorID: string | null = null;
            for (const prior of priorResult.Results ?? []) {
                if (!firstPriorID) firstPriorID = prior.ID;
                const priorO = await LoadOverride(provider, user, prior.ID);
                const priorC = await LoadComponent(provider, user, prior.ComponentID);
                if (priorO) {
                    priorO.Status = 'Inactive';
                    if (!(await priorO.Save())) {
                        return notSetAside(target.ID, `override ${prior.ID}`, priorO.LatestResult?.CompleteMessage);
                    }
                }
                if (priorC) {
                    priorC.Status = MapToComponentStatus('Inactive');
                    if (!(await priorC.Save())) {
                        return notSetAside(target.ID, `component ${prior.ComponentID}`, priorC.LatestResult?.CompleteMessage);
                    }
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

/** The result when the target is Active but a prior version's row could not be set aside. */
function notSetAside(targetID: string, what: string, reason: string | undefined): ActionResultSimple {
    return Failure("PERSIST_FAILED",
        `Override ${targetID} is now Active, but the prior ${what} could not be set aside: ${reason ?? 'unknown error'}`);
}

/** Tree-shaking guard. */
export function LoadActivateInteractiveFormVersionAction(): void {
    if (false as boolean) {
        const _: unknown = ActivateInteractiveFormVersionAction;
    }
}
