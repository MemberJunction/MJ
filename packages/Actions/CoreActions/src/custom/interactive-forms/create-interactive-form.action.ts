import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    addOutput, failure, getStringParam, insertComponent, insertOverride,
    lintFormSpec, parseSpecParam,
} from "./_shared";

/**
 * Create a net-new interactive-form override for the requesting user.
 *
 * **Net-new path only.** Returns ALREADY_EXISTS if the user already has an
 * Active override for the target entity — agents should call
 * `Get Active Form For Entity` first and route to `Modify Interactive Form`
 * in that case. (Pending sibling overrides do NOT block creation — those
 * are an in-flight refinement and Modify will resolve them in-place.)
 *
 * **Security clamp — Scope.** This action *always* writes
 * `Scope='User', UserID=ctx.user.ID, Status='Active', Priority=0`,
 * regardless of any scope-related parameter the caller might supply.
 * This is the load-bearing safety property of the AI authoring path:
 * an agent cannot write Global or Role overrides that would affect
 * other users. Scope promotion (User → Role → Global) is a separate,
 * deliberate human action in Component Studio / Form Builder dashboard.
 *
 * **Atomicity.** If the override insert fails after the Component insert
 * succeeds, we surface PERSIST_FAILED with the Component already in the
 * table. Orphan Components are harmless — they don't render anywhere
 * until something points an override at them. The caller can retry; a
 * second run will create a fresh Component and a successful override.
 */
@RegisterClass(BaseAction, "__CreateInteractiveForm")
export class CreateInteractiveFormAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const inputs = this.extractInputs(params);
            if ('error' in inputs) return inputs.error;

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser to clamp override scope.");

            const entityInfo = provider.EntityByName(inputs.EntityName);
            if (!entityInfo) {
                return failure("ENTITY_NOT_FOUND",
                    `Entity '${inputs.EntityName}' is not registered with the active metadata provider.`);
            }

            // Guard: don't silently create a duplicate Active override.
            // Pending siblings are fine — they're an in-flight cycle and the
            // caller should know to use Modify on those.
            const rv = RunView.FromMetadataProvider(provider);
            const dupResult = await rv.RunView<{ ID: string }>({
                EntityName: "MJ: Entity Form Overrides",
                ExtraFilter: `EntityID='${entityInfo.ID}' AND Scope='User' AND UserID='${user.ID}' AND Status='Active'`,
                Fields: ['ID'],
                ResultType: 'simple',
                MaxRows: 1,
            }, user);
            if (dupResult.Success && (dupResult.Results ?? []).length > 0) {
                const existingID = dupResult.Results![0].ID;
                return failure("ALREADY_EXISTS",
                    `An Active User-scope override already exists for entity '${inputs.EntityName}' (OverrideID=${existingID}). Use 'Modify Interactive Form' to refine it, or 'Revert Interactive Form' to switch to a different version.`);
            }

            // Lint before any persistence — fail-hard.
            const lintFail = await lintFormSpec(inputs.Spec, user);
            if (lintFail) return lintFail;

            const componentInsert = await insertComponent({
                provider, user,
                spec: inputs.Spec,
                fallbackName: inputs.Name,
                description: inputs.Description,
                version: "1.0.0",
                versionSequence: 1,
                componentStatus: 'Active',
            });
            if ('error' in componentInsert) return componentInsert.error;
            const componentID = componentInsert.id;

            const overrideInsert = await insertOverride({
                provider, user,
                entityID: entityInfo.ID,
                componentID,
                name: inputs.Name,
                description: inputs.Description,
                notes: inputs.Notes,
                status: 'Active',
                priority: 0,
            });
            if ('error' in overrideInsert) {
                return failure("PERSIST_FAILED",
                    `${overrideInsert.error.Message} (Component ${componentID} was persisted but has no override yet.)`);
            }

            addOutput(params, "ComponentID", componentID);
            addOutput(params, "OverrideID", overrideInsert.id);
            addOutput(params, "Version", "1.0.0");

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    ComponentID: componentID,
                    OverrideID: overrideInsert.id,
                    EntityName: inputs.EntityName,
                    Scope: "User",
                    Status: "Active",
                    Version: "1.0.0",
                }),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`CreateInteractiveFormAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    private extractInputs(params: RunActionParams):
        | { EntityName: string; Spec: ComponentSpec; Name: string; Description: string | null; Notes: string | null }
        | { error: ActionResultSimple }
    {
        const entityName = getStringParam(params, "EntityName");
        if (!entityName) return { error: failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.") };
        const name = getStringParam(params, "Name");
        if (!name) return { error: failure("MISSING_PARAMETER", "Parameter 'Name' is required.") };

        const specRaw = params.Params.find(x =>
            x.Name?.trim().toLowerCase() === "spec")?.Value;
        if (specRaw == null) return { error: failure("MISSING_PARAMETER", "Parameter 'Spec' is required.") };
        const parsed = parseSpecParam(specRaw);
        if ('error' in parsed) {
            return { error: failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`) };
        }

        return {
            EntityName: entityName,
            Spec: parsed,
            Name: name,
            Description: getStringParam(params, "Description"),
            Notes: getStringParam(params, "Notes"),
        };
    }
}

/** Tree-shaking guard. */
export function LoadCreateInteractiveFormAction(): void {
    if (false as boolean) {
        const _: unknown = CreateInteractiveFormAction;
    }
}
