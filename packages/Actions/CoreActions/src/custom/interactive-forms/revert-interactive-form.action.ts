import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import {
    AddOutput, CheckPersonalWrite, Failure, GetNumberParam, GetStringParam, LoadComponent, LoadOverride, MapToComponentStatus,
} from "./_shared";

/**
 * Revert the user's Active override to an older Component version. Pure
 * re-point: no new Component is created, no new Override row is created.
 *
 * Behaviour:
 *   - Identify the **Active** Override for the (entity, user) — we either
 *     take it from the input `ActiveOverrideID` if supplied, or look it up
 *     using the target Component's EntityID.
 *   - Identify the target Component to revert to — by `TargetComponentID`
 *     or by `TargetVersionSequence` (relative to the Component lineage
 *     sharing the same Name as the currently-active Component).
 *   - Set Active Override's `ComponentID` to the target → save.
 *   - Flip the previously-pointed Component to Status='Inactive', target
 *     Component to Status='Active'.
 *
 * The override is saved first. If a Component's status then cannot be saved,
 * the action returns `PERSIST_FAILED` and says which Component; the override
 * stays re-pointed.
 *
 * Old Component rows are never deleted — they remain as immutable history.
 * A subsequent revert can move forward again to any version.
 *
 * Only the caller's own User-scope overrides can be reverted. A Role or Global
 * override, or another user's, returns FORBIDDEN for every caller (see
 * `CheckPersonalWrite` in `_shared.ts`): shared forms are managed from Form
 * Builder or the form's Manage drawer.
 *
 * Inputs:
 *   - `ActiveOverrideID` (required, string) — the Active override to re-point
 *   - One of:
 *       - `TargetComponentID` (string) — explicit Component to revert to, or
 *       - `TargetVersionSequence` (number) — pick the Component with this
 *         VersionSequence in the same Name lineage
 *
 * Outputs:
 *   - `OverrideID` — echoed
 *   - `ComponentID` — the newly-Active component
 *   - `PreviousComponentID` — the component we demoted
 *   - `Version` — version string of the now-Active component
 */
@RegisterClass(BaseAction, "__RevertInteractiveForm")
export class RevertInteractiveFormAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const activeOverrideID = GetStringParam(params, "ActiveOverrideID");
            if (!activeOverrideID) {
                return Failure("MISSING_PARAMETER", "Parameter 'ActiveOverrideID' is required.");
            }
            const targetComponentID = GetStringParam(params, "TargetComponentID");
            const targetVersionSequence = GetNumberParam(params, "TargetVersionSequence");
            if (!targetComponentID && targetVersionSequence == null) {
                return Failure("MISSING_PARAMETER",
                    "Either 'TargetComponentID' or 'TargetVersionSequence' is required.");
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser.");

            const override = await LoadOverride(provider, user, activeOverrideID);
            if (!override) {
                return Failure("OVERRIDE_NOT_FOUND", `EntityFormOverride '${activeOverrideID}' not found.`);
            }
            const ownershipFail = CheckPersonalWrite(override, user);
            if (ownershipFail) return ownershipFail;
            if (override.Status !== 'Active') {
                return Failure("NOT_ACTIVE",
                    `Override ${activeOverrideID} is not Active (current Status=${override.Status}). Reverting only operates on the Active override row.`);
            }

            const currentComponent = await LoadComponent(provider, user, override.ComponentID);
            if (!currentComponent) {
                return Failure("COMPONENT_NOT_FOUND",
                    `Active override points at Component ${override.ComponentID} which no longer exists.`);
            }

            // Resolve target Component
            let target: { ID: string; Version: string } | null = null;
            if (targetComponentID) {
                const c = await LoadComponent(provider, user, targetComponentID);
                if (!c) {
                    return Failure("COMPONENT_NOT_FOUND",
                        `TargetComponentID '${targetComponentID}' not found.`);
                }
                // Confirm same lineage (same Name).
                if ((c.Name ?? '') !== (currentComponent.Name ?? '')) {
                    return Failure("LINEAGE_MISMATCH",
                        `Target Component name '${c.Name}' differs from current '${currentComponent.Name}'. Revert is restricted to the same Name lineage.`);
                }
                target = { ID: c.ID, Version: c.Version };
            } else if (targetVersionSequence != null) {
                const rv = RunView.FromMetadataProvider(provider);
                const r = await rv.RunView<{ ID: string; Version: string; VersionSequence: number }>({
                    EntityName: "MJ: Components",
                    ExtraFilter: `Name='${currentComponent.Name?.replace(/'/g, "''")}' AND VersionSequence=${targetVersionSequence}`,
                    Fields: ['ID', 'Version', 'VersionSequence'],
                    ResultType: 'simple',
                    MaxRows: 1,
                }, user);
                if (!r.Success || (r.Results ?? []).length === 0) {
                    return Failure("COMPONENT_NOT_FOUND",
                        `No Component with VersionSequence=${targetVersionSequence} in lineage '${currentComponent.Name}'.`);
                }
                target = { ID: r.Results[0].ID, Version: r.Results[0].Version };
            }
            if (!target) {
                return Failure("COMPONENT_NOT_FOUND", "Could not resolve target Component.");
            }
            if (UUIDsEqual(target.ID, currentComponent.ID)) {
                AddOutput(params, "OverrideID", override.ID);
                AddOutput(params, "ComponentID", target.ID);
                AddOutput(params, "PreviousComponentID", null);
                AddOutput(params, "Version", target.Version);
                return { Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({ noop: true, reason: 'TargetComponent is already the Active component.' }) };
            }

            // Re-point the override.
            override.ComponentID = target.ID;
            const oSaved = await override.Save();
            if (!oSaved) {
                return Failure("PERSIST_FAILED",
                    `Could not re-point Override: ${override.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            // Flip Component statuses to reflect the new active selection.
            const newActive = await LoadComponent(provider, user, target.ID);
            if (newActive) {
                newActive.Status = MapToComponentStatus('Active');
                if (!(await newActive.Save())) {
                    return statusNotUpdated(override.ID, target.ID, target.ID, newActive.LatestResult?.CompleteMessage);
                }
            }
            currentComponent.Status = MapToComponentStatus('Inactive');
            if (!(await currentComponent.Save())) {
                return statusNotUpdated(override.ID, target.ID, currentComponent.ID, currentComponent.LatestResult?.CompleteMessage);
            }

            AddOutput(params, "OverrideID", override.ID);
            AddOutput(params, "ComponentID", target.ID);
            AddOutput(params, "PreviousComponentID", currentComponent.ID);
            AddOutput(params, "Version", target.Version);
            return { Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    OverrideID: override.ID,
                    ComponentID: target.ID,
                    PreviousComponentID: currentComponent.ID,
                    Version: target.Version,
                }) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`RevertInteractiveFormAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }
}

/** The result when the override was re-pointed but a Component's status could not be saved. */
function statusNotUpdated(overrideID: string, targetID: string, componentID: string, reason: string | undefined): ActionResultSimple {
    return Failure("PERSIST_FAILED",
        `Override ${overrideID} was re-pointed to Component ${targetID}, but the status of Component ${componentID} ` +
        `was not updated: ${reason ?? 'unknown error'}`);
}

/** Tree-shaking guard. */
export function LoadRevertInteractiveFormAction(): void {
    if (false as boolean) {
        const _: unknown = RevertInteractiveFormAction;
    }
}
