import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView, type IMetadataProvider, type UserInfo } from "@memberjunction/core";
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
 * that transaction, its Component first and its Override last; if one of those
 * saves fails, the action returns `PERSIST_FAILED` and the target stays Active.
 * The prior Override stays Active until its own save succeeds.
 *
 * Idempotency. If the target Override is already Active, the caller's other
 * Active overrides on the entity are set aside and the action returns SUCCESS
 * with a no-op message that carries `DemotedCount`. So a retry after
 * `PERSIST_FAILED` sets the prior version aside. If the target is Inactive,
 * that's a misuse — we surface NOT_PENDING so the agent / UI can ask the user
 * what they really want.
 *
 * Inputs:
 *   - `OverrideID` (required, string) — the Pending override to activate
 *
 * Outputs:
 *   - `ComponentID` — the Component now Active
 *   - `OverrideID` — echoed for convenience
 *   - `PreviousActiveOverrideID` — the first override that was demoted (or null)
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
            if (target.Status === 'Inactive') {
                return Failure("NOT_PENDING",
                    `Override ${overrideID} is Inactive. Use 'Revert Interactive Form' to restore an older version, not 'Activate'.`);
            }

            const priors = await findPriorActiveOverrides(provider, user, target);
            if ('error' in priors) return priors.error;
            const previousActiveID = priors.rows[0]?.ID ?? null;

            if (target.Status === 'Active') {
                const notDemoted = await setPriorsAside(provider, user, target.ID, priors.rows);
                if (notDemoted) return notDemoted;
                AddOutput(params, "ComponentID", target.ComponentID);
                AddOutput(params, "OverrideID", target.ID);
                AddOutput(params, "PreviousActiveOverrideID", previousActiveID);
                return { Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({
                        noop: true,
                        OverrideID: target.ID,
                        ComponentID: target.ComponentID,
                        PreviousActiveOverrideID: previousActiveID,
                        DemotedCount: priors.rows.length,
                    }) };
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

            const notDemoted = await setPriorsAside(provider, user, target.ID, priors.rows);
            if (notDemoted) return notDemoted;

            AddOutput(params, "ComponentID", target.ComponentID);
            AddOutput(params, "OverrideID", target.ID);
            AddOutput(params, "PreviousActiveOverrideID", previousActiveID);
            return { Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    OverrideID: target.ID,
                    ComponentID: target.ComponentID,
                    PreviousActiveOverrideID: previousActiveID,
                    DemotedCount: priors.rows.length,
                }) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ActivateInteractiveFormVersionAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }
}

/** A prior Active sibling override and the component it points at. */
interface PriorActiveOverride {
    ID: string;
    ComponentID: string;
}

/** The caller's other Active User-scope overrides on the target's entity, or a `QUERY_FAILED` result. */
async function findPriorActiveOverrides(
    provider: IMetadataProvider,
    user: UserInfo,
    target: { ID: string; EntityID: string; UserID: string | null },
): Promise<{ rows: PriorActiveOverride[] } | { error: ActionResultSimple }> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<PriorActiveOverride>({
        EntityName: "MJ: Entity Form Overrides",
        ExtraFilter: `EntityID='${EscapeSQLString(target.EntityID)}' AND Scope='User' AND UserID='${EscapeSQLString(target.UserID ?? '')}' AND Status='Active' AND ID <> '${EscapeSQLString(target.ID)}'`,
        Fields: ['ID', 'ComponentID'],
        ResultType: 'simple',
    }, user);
    if (!result.Success) {
        return { error: Failure("QUERY_FAILED", `Prior-active lookup failed: ${result.ErrorMessage ?? 'unknown error'}`) };
    }
    return { rows: result.Results ?? [] };
}

/**
 * Sets each prior version aside: its Component to Deprecated, then its Override to Inactive.
 * Returns `PERSIST_FAILED` at the first save that fails, or null when every prior is set aside.
 * The Override is saved last, so a prior that is not fully set aside is still Active and a later
 * lookup finds it again.
 */
async function setPriorsAside(
    provider: IMetadataProvider,
    user: UserInfo,
    targetID: string,
    priors: PriorActiveOverride[],
): Promise<ActionResultSimple | null> {
    for (const prior of priors) {
        const priorC = await LoadComponent(provider, user, prior.ComponentID);
        if (priorC) {
            priorC.Status = MapToComponentStatus('Inactive');
            if (!(await priorC.Save())) {
                return notSetAside(targetID, `component ${prior.ComponentID}`, priorC.LatestResult?.CompleteMessage);
            }
        }
        const priorO = await LoadOverride(provider, user, prior.ID);
        if (priorO) {
            priorO.Status = 'Inactive';
            if (!(await priorO.Save())) {
                return notSetAside(targetID, `override ${prior.ID}`, priorO.LatestResult?.CompleteMessage);
            }
        }
    }
    return null;
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
