import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    addOutput, bumpMinorVersion, checkOverrideOwnership, failure, getStringParam,
    insertComponent, insertOverride, lintFormSpec, loadComponent, loadOverride,
    mapFromComponentStatus, parseSpecParam,
} from "./_shared";

/**
 * Modify an existing interactive-form override.
 *
 * Behaviour branches on the **status of the Component the override points
 * at**:
 *
 *   - Component.Status === 'Pending'
 *       The current override is itself the in-flight refinement target.
 *       Modify the Component row **in place** — overwrite `Specification`,
 *       bump `__mj_UpdatedAt` (automatic). No new Component row, no new
 *       Override row. This is what prevents back-and-forth chat refinement
 *       from spawning a tower of untouched draft versions.
 *
 *   - Component.Status === 'Active' (or anything else)
 *       The current override points at the live form. Insert a **new
 *       Component row** with the same `Name`, bumped Version + VersionSequence,
 *       `Status='Pending'`. Insert a **new EntityFormOverride row** with
 *       `Status='Pending'` pointing at the new Component. The existing
 *       Active override is untouched — users must explicitly Activate the
 *       new version before it takes effect.
 *
 * **Security clamp.** Modify *always* writes a User-scope Pending Override,
 * regardless of the original override's scope. Even if the caller is
 * modifying a Role-scope or Global override (which they have permission to
 * read because they pass the ownership check), the new Pending sibling
 * is always User-scoped to the calling user. Scope promotion (User → Role
 * → Global) is a separate, deliberate human action with its own permission
 * gate in Component Studio / Form Builder. The agent cannot widen scope
 * through Modify any more than through Create.
 *
 * **Ownership check.** The caller must own (or have role membership for, or
 * be admin over) the existing override they're modifying. See
 * `checkOverrideOwnership` in `_shared.ts`. Returns FORBIDDEN if rejected.
 *
 * Inputs:
 *   - `OverrideID` (required, string) — the override to modify
 *   - `Spec` (required, ComponentSpec | string) — the new form spec
 *   - `Notes` (optional, string) — appended to the override's Notes column
 *
 * Outputs:
 *   - `ComponentID` — the Component row (new or existing-Pending) that now holds the spec
 *   - `OverrideID` — the Override row that points at it (new or unchanged)
 *   - `Mode` — 'in-place' or 'new-version'
 *   - `Version` — the Component's Version string (helpful for UX)
 */
@RegisterClass(BaseAction, "__ModifyInteractiveForm")
export class ModifyInteractiveFormAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const overrideID = getStringParam(params, "OverrideID");
            if (!overrideID) {
                return failure("MISSING_PARAMETER", "Parameter 'OverrideID' is required.");
            }
            const specRaw = this.findParam(params, "Spec");
            if (specRaw == null) {
                return failure("MISSING_PARAMETER", "Parameter 'Spec' is required.");
            }
            const parsed = parseSpecParam(specRaw);
            if ('error' in parsed) {
                return failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`);
            }
            const spec: ComponentSpec = parsed;
            const notes = getStringParam(params, "Notes");

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const override = await loadOverride(provider, user, overrideID);
            if (!override) {
                return failure("OVERRIDE_NOT_FOUND", `EntityFormOverride '${overrideID}' not found.`);
            }
            // Defense-in-depth ownership check — see _shared.ts.
            const ownershipFail = checkOverrideOwnership(override, user);
            if (ownershipFail) return ownershipFail;
            const existingComponent = await loadComponent(provider, user, override.ComponentID);
            if (!existingComponent) {
                return failure("COMPONENT_NOT_FOUND",
                    `Override ${overrideID} points at Component ${override.ComponentID} which no longer exists.`);
            }

            // Lint before any persistence — fail-hard.
            const lintFail = await lintFormSpec(spec, user);
            if (lintFail) return lintFail;

            const isPending = mapFromComponentStatus(existingComponent.Status) === 'Pending';
            if (isPending) {
                // ── in-place modify of the Pending Component ─────────────
                existingComponent.Specification = JSON.stringify(spec);
                // Refresh Title/Description if the new spec moves them.
                if (spec.title) existingComponent.Title = spec.title;
                if (spec.description) existingComponent.Description = spec.description;
                const saved = await existingComponent.Save();
                if (!saved) {
                    return failure("PERSIST_FAILED",
                        `Component in-place update failed: ${existingComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
                if (notes) {
                    // Append a line of human-readable notes. The Notes column
                    // accepts NVARCHAR(MAX), so this scales.
                    const existingNotes = (override as unknown as { Notes?: string | null }).Notes ?? '';
                    (override as unknown as { Notes?: string | null }).Notes = existingNotes
                        ? `${existingNotes}\n${notes}`
                        : notes;
                    await override.Save();
                }
                addOutput(params, "ComponentID", existingComponent.ID);
                addOutput(params, "OverrideID", override.ID);
                addOutput(params, "Mode", "in-place");
                addOutput(params, "Version", existingComponent.Version);
                return {
                    Success: true, ResultCode: "SUCCESS",
                    Message: JSON.stringify({
                        Mode: 'in-place',
                        ComponentID: existingComponent.ID,
                        OverrideID: override.ID,
                        Version: existingComponent.Version,
                    }),
                };
            }

            // ── new-version path: existing is Active, snapshot a new version ──
            const newVersion = bumpMinorVersion(existingComponent.Version);
            const newSequence = (existingComponent.VersionSequence ?? 0) + 1;
            const componentInsert = await insertComponent({
                provider, user, spec,
                fallbackName: existingComponent.Name,
                description: existingComponent.Description,
                version: newVersion,
                versionSequence: newSequence,
                componentStatus: 'Pending',
            });
            if ('error' in componentInsert) return componentInsert.error;
            const newComponentID = componentInsert.id;

            // New Pending Override at the same scope as the existing one. We
            // do not widen scope: if existing is User-scoped, new is too. If
            // somehow existing is Role/Global (manual promotion), we still
            // honor that — Modify is a content change, not a scope change.
            const overrideInsert = await insertOverride({
                provider, user,
                entityID: override.EntityID,
                componentID: newComponentID,
                name: override.Name,
                description: override.Description,
                notes,
                status: 'Pending',
                priority: override.Priority,
            });
            if ('error' in overrideInsert) {
                return failure("PERSIST_FAILED",
                    `${overrideInsert.error.Message} (Component ${newComponentID} was persisted; its sibling override row failed to write.)`);
            }

            addOutput(params, "ComponentID", newComponentID);
            addOutput(params, "OverrideID", overrideInsert.id);
            addOutput(params, "Mode", "new-version");
            addOutput(params, "Version", newVersion);
            return {
                Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    Mode: 'new-version',
                    ComponentID: newComponentID,
                    OverrideID: overrideInsert.id,
                    Version: newVersion,
                    PreviousActiveOverrideID: override.ID,
                    PreviousActiveComponentID: existingComponent.ID,
                }),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ModifyInteractiveFormAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    private findParam(params: RunActionParams, name: string): unknown {
        const p = params.Params.find(x =>
            x.Name?.trim().toLowerCase() === name.toLowerCase());
        return p?.Value;
    }
}

/** Tree-shaking guard. */
export function LoadModifyInteractiveFormAction(): void {
    if (false as boolean) {
        const _: unknown = ModifyInteractiveFormAction;
    }
}
