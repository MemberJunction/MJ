import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    addOutput, bumpVersion, checkOverrideOwnership, failure, getStringParam,
    insertComponent, insertOverride, lintFormSpec, loadComponent, loadOverride,
    mapToComponentStatus, parseSpecParam, parseVersionBumpKind,
    type VersionBumpKind,
} from "./_shared";

/**
 * Modify an existing interactive-form override.
 *
 * Behavior is driven by the **`VersionBumpKind` input** and the **source
 * Override's status** (Override is the canonical "is this live" signal —
 * Component.Status can drift independently):
 *
 * | Source Status | VersionBumpKind        | Behavior                                                                                                                                            |
 * |---------------|------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
 * | Pending       | `in-place` (default)   | Overwrite the existing Pending Component row in place. No new version. Iteration-loop behavior.                                                     |
 * | Pending       | `patch` / `minor` / `major` | **Demote** the existing Pending → Inactive, then insert a new Pending Component v(bumped) + new Pending Override pointing at it. Creates rollback. |
 * | Active        | `in-place`             | **Rejected** — would corrupt the live Active row. Returns `INVALID_BUMP_FOR_STATUS`.                                                                |
 * | Active        | `patch` / `minor` (default) / `major` | Insert new Pending Component v(bumped) + new Pending Override. Active is untouched — user explicitly Activates later.                  |
 * | Inactive      | `in-place`             | **Rejected** — overwriting a dead row achieves nothing. Use 'Revert Interactive Form' to re-activate first, or supply a bump kind.                  |
 * | Inactive      | `patch` (default) / `minor` / `major` | Branch-from-historical. Insert new Pending Component v(bumped) sourced from this Inactive spec. The Inactive source is left alone (already historical). |
 *
 * **Defaults** preserve historical behavior: omit `VersionBumpKind` and
 * Pending sources stay in-place, Active sources bump minor, Inactive
 * sources bump patch (the conservative branch-from-historical case).
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
 *   - `VersionBumpKind` (optional, 'in-place' | 'patch' | 'minor' | 'major') — see table above
 *
 * Outputs:
 *   - `ComponentID` — the Component row that now holds the spec (new for snapshots, same for in-place)
 *   - `OverrideID` — the Override row that points at it
 *   - `Mode` — 'in-place' or 'new-version'
 *   - `Version` — the Component's resulting Version string
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

            // Lineage identity guard. Component lineage is collapsed by Name
            // in the Form Builder version rail — different Name = different
            // lineage, no rollback link between them. The agent must NOT
            // rename across Modify calls (e.g. sanitizing "Contemporary AI
            // Models Form" → "ContemporaryAIModelsForm" to satisfy
            // component-name-mismatch lint silently forks the user's form
            // into a phantom new lineage). Reject mismatches with a clear
            // error so the agent retries with the right name. The function
            // name inside spec.code MUST match spec.name (enforced by
            // component-name-mismatch lint) — keep spec.name pinned to the
            // existing Component.Name and sanitize the function name to
            // match, never the other way around.
            if (spec.name && spec.name !== existingComponent.Name) {
                return failure("LINEAGE_NAME_MISMATCH",
                    `Modify requires spec.name to match the existing Component name '${existingComponent.Name}', got '${spec.name}'. Modify operates on a Component lineage — its identity is the Name and cannot change between versions. Update spec.name and the function declaration in spec.code to '${existingComponent.Name}' and retry. (If the user wants a renamed form, that's a Create on the new entity or a manual rename in Form Builder, not a Modify.)`);
            }
            // Pin Name and Title to the existing row regardless — covers
            // the case where the agent omitted spec.name entirely.
            spec.name = existingComponent.Name;
            if (existingComponent.Title && !spec.title) spec.title = existingComponent.Title;

            // Lint AFTER the lineage guard so any name/title pinning is
            // visible to the linter (function-name match, etc.).
            const lintFail = await lintFormSpec(spec, user);
            if (lintFail) return lintFail;

            // Resolve VersionBumpKind: explicit param wins; otherwise default
            // by source status to preserve historical behavior — Pending →
            // in-place (iteration loop), Active → minor (snapshot).
            //
            // Route off the OVERRIDE's status, not the Component's. The Override
            // is what determines whether a form is live; Component.Status can
            // drift independently (manual edits, partial activations) and using
            // it for routing risks demoting an Active override on the assumption
            // it's a Pending iteration.
            const overrideStatus = (override as unknown as { Status?: string }).Status ?? 'Pending';
            const sourceStatus: 'Active' | 'Pending' | 'Inactive' =
                overrideStatus === 'Active' ? 'Active' :
                overrideStatus === 'Pending' ? 'Pending' : 'Inactive';
            const isPendingSource = sourceStatus === 'Pending';
            const rawKind = getStringParam(params, "VersionBumpKind");
            let bumpKind: VersionBumpKind;
            if (rawKind) {
                const parsed = parseVersionBumpKind(rawKind);
                if (!parsed) {
                    return failure("INVALID_BUMP_KIND",
                        `Unknown VersionBumpKind '${rawKind}'. Expected one of: 'in-place', 'patch', 'minor', 'major'.`);
                }
                bumpKind = parsed;
            } else {
                // Default behavior by source status. Inactive defaults to
                // 'patch' (the conservative branch-from-historical case);
                // any explicit kind still wins above.
                bumpKind = isPendingSource ? 'in-place' : (sourceStatus === 'Inactive' ? 'patch' : 'minor');
            }

            // 'in-place' is only meaningful against a Pending source — it
            // overwrites the iteration's Spec on the same row. Against
            // Active (would clobber live) or Inactive (overwriting a dead
            // row achieves nothing — won't re-activate it; use Revert for
            // that) we reject loudly so the caller corrects intent.
            if (bumpKind === 'in-place' && !isPendingSource) {
                return failure("INVALID_BUMP_FOR_STATUS",
                    `'in-place' is only valid against a Pending Override (got Status='${overrideStatus}'). Use 'patch', 'minor', or 'major' to snapshot a new Pending version from this source; use 'Revert Interactive Form' to re-activate an Inactive historical version.`);
            }

            if (bumpKind === 'in-place') {
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

            // ── new-version path: snapshot to a new Pending Component +
            // sibling Override. Works for Active sources (preserves the
            // live Active row), Pending sources (where we demote the existing
            // Pending → Inactive to keep the rollback history without producing
            // two concurrent Pendings), and Inactive sources (branch-from-
            // historical — no demote needed since source is already Inactive,
            // and the user explicitly opened it to fork from there).
            const newVersion = bumpVersion(existingComponent.Version, bumpKind);
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

            // Demote the prior Pending source — both the Component row and
            // its Override row — to Inactive. This preserves the rollback
            // history (the row stays in the version rail and can be
            // re-Activated later) without leaving two concurrent Pendings
            // for the same lineage. Failures here are non-fatal: the new
            // version is already persisted, so we log and continue rather
            // than tearing down what we just wrote.
            let demotedComponentID: string | null = null;
            let demotedOverrideID: string | null = null;
            if (isPendingSource) {
                // Component table uses 'Draft'/'Published'/'Deprecated' —
                // map our 'Inactive' lifecycle to the table's 'Deprecated'.
                try {
                    existingComponent.Status = mapToComponentStatus('Inactive');
                    const ok = await existingComponent.Save();
                    if (ok) demotedComponentID = existingComponent.ID;
                    else LogError(`ModifyInteractiveFormAction: failed to demote prior Pending Component ${existingComponent.ID}: ${existingComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                } catch (err) {
                    LogError(`ModifyInteractiveFormAction: error demoting prior Pending Component ${existingComponent.ID}: ${err instanceof Error ? err.message : String(err)}`);
                }
                try {
                    (override as unknown as { Status?: string }).Status = 'Inactive';
                    const ok = await override.Save();
                    if (ok) demotedOverrideID = override.ID;
                    else LogError(`ModifyInteractiveFormAction: failed to demote prior Pending Override ${override.ID}: ${override.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                } catch (err) {
                    LogError(`ModifyInteractiveFormAction: error demoting prior Pending Override ${override.ID}: ${err instanceof Error ? err.message : String(err)}`);
                }
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
                    BumpKind: bumpKind,
                    PreviousComponentID: existingComponent.ID,
                    PreviousOverrideID: override.ID,
                    PreviousSourceStatus: sourceStatus,
                    DemotedComponentID: demotedComponentID,
                    DemotedOverrideID: demotedOverrideID,
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
