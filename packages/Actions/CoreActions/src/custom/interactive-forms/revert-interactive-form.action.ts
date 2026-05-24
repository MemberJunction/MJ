import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import {
    addOutput, failure, getNumberParam, getStringParam, loadComponent, loadOverride, mapToComponentStatus,
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
 * Old Component rows are never deleted — they remain as immutable history.
 * A subsequent revert can move forward again to any version.
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
            const activeOverrideID = getStringParam(params, "ActiveOverrideID");
            if (!activeOverrideID) {
                return failure("MISSING_PARAMETER", "Parameter 'ActiveOverrideID' is required.");
            }
            const targetComponentID = getStringParam(params, "TargetComponentID");
            const targetVersionSequence = getNumberParam(params, "TargetVersionSequence");
            if (!targetComponentID && targetVersionSequence == null) {
                return failure("MISSING_PARAMETER",
                    "Either 'TargetComponentID' or 'TargetVersionSequence' is required.");
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const override = await loadOverride(provider, user, activeOverrideID);
            if (!override) {
                return failure("OVERRIDE_NOT_FOUND", `EntityFormOverride '${activeOverrideID}' not found.`);
            }
            if (override.Status !== 'Active') {
                return failure("NOT_ACTIVE",
                    `Override ${activeOverrideID} is not Active (current Status=${override.Status}). Reverting only operates on the Active override row.`);
            }

            const currentComponent = await loadComponent(provider, user, override.ComponentID);
            if (!currentComponent) {
                return failure("COMPONENT_NOT_FOUND",
                    `Active override points at Component ${override.ComponentID} which no longer exists.`);
            }

            // Resolve target Component
            let target: { ID: string; Version: string } | null = null;
            if (targetComponentID) {
                const c = await loadComponent(provider, user, targetComponentID);
                if (!c) {
                    return failure("COMPONENT_NOT_FOUND",
                        `TargetComponentID '${targetComponentID}' not found.`);
                }
                // Confirm same lineage (same Name).
                if ((c.Name ?? '') !== (currentComponent.Name ?? '')) {
                    return failure("LINEAGE_MISMATCH",
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
                    return failure("COMPONENT_NOT_FOUND",
                        `No Component with VersionSequence=${targetVersionSequence} in lineage '${currentComponent.Name}'.`);
                }
                target = { ID: r.Results[0].ID, Version: r.Results[0].Version };
            }
            if (!target) {
                return failure("COMPONENT_NOT_FOUND", "Could not resolve target Component.");
            }
            if (target.ID === currentComponent.ID) {
                addOutput(params, "OverrideID", override.ID);
                addOutput(params, "ComponentID", target.ID);
                addOutput(params, "PreviousComponentID", null);
                addOutput(params, "Version", target.Version);
                return { Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({ noop: true, reason: 'TargetComponent is already the Active component.' }) };
            }

            // Re-point the override.
            override.ComponentID = target.ID;
            const oSaved = await override.Save();
            if (!oSaved) {
                return failure("PERSIST_FAILED",
                    `Could not re-point Override: ${override.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            // Flip Component statuses to reflect the new active selection.
            const newActive = await loadComponent(provider, user, target.ID);
            if (newActive) {
                newActive.Status = mapToComponentStatus('Active');
                await newActive.Save();
            }
            currentComponent.Status = mapToComponentStatus('Inactive');
            await currentComponent.Save();

            addOutput(params, "OverrideID", override.ID);
            addOutput(params, "ComponentID", target.ID);
            addOutput(params, "PreviousComponentID", currentComponent.ID);
            addOutput(params, "Version", target.Version);
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
            return failure("UNEXPECTED_ERROR", message);
        }
    }
}

/** Tree-shaking guard. */
export function LoadRevertInteractiveFormAction(): void {
    if (false as boolean) {
        const _: unknown = RevertInteractiveFormAction;
    }
}
