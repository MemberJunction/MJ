import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { buildDefaultFormScaffold } from "@memberjunction/interactive-component-types/forms";

/**
 * Read-only action that produces a working form-role `ComponentSpec`
 * scaffolded from the entity's CodeGen metadata (Category /
 * GeneratedFormSectionType / Sequence / FK relationships / value lists).
 *
 * **Why this exists.** Today the Form Builder agent writes JSX from
 * scratch every time, producing inconsistent quality. Calling this action
 * first gives the agent a known-good baseline (mirrors the default Angular
 * form) that it can modify per user requirements instead of inventing a
 * layout. Far fewer lint failures, dramatically better starting point.
 *
 * **Pure read.** No persistence. The returned spec is intended to be
 * modified and then passed to {@link CreateInteractiveFormAction} or
 * {@link ModifyInteractiveFormAction}.
 */
@RegisterClass(BaseAction, "__GetDefaultFormScaffoldForEntity")
export class GetDefaultFormScaffoldForEntityAction extends BaseAction {

    /**
     * Required input:
     *   - `EntityName` (string) — fully-qualified entity name, e.g. "MJ: Applications".
     *
     * Output:
     *   - `Spec` parameter — the scaffolded `ComponentSpec` object (componentRole='form', location='embedded').
     *   - `Message` — the same object, stringified.
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = this.getStringParam(params, "EntityName");
            if (!entityName) {
                return failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.");
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) {
                return failure("NO_PROVIDER", "No metadata provider available.");
            }

            const spec = buildDefaultFormScaffold(entityName, provider);
            if (!spec) {
                return failure(
                    "ENTITY_NOT_FOUND",
                    `Entity '${entityName}' is not registered with the active metadata provider.`,
                );
            }

            params.Params.push({
                Name: "Spec",
                Type: "Output",
                Value: spec,
            });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(spec),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetDefaultFormScaffoldForEntityAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    private getStringParam(params: RunActionParams, name: string): string | null {
        const p = params.Params.find(x =>
            x.Name?.trim().toLowerCase() === name.toLowerCase());
        if (!p || p.Value == null) return null;
        const v = String(p.Value).trim();
        return v.length > 0 ? v : null;
    }
}

function failure(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
}

/** Tree-shaking guard — called from src/index.ts. */
export function LoadGetDefaultFormScaffoldForEntityAction(): void {
    if (false as boolean) {
        const _: unknown = GetDefaultFormScaffoldForEntityAction;
    }
}
