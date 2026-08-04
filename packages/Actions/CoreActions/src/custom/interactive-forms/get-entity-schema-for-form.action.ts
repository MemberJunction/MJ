import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { buildCuratedFormSchema } from "@memberjunction/interactive-component-types/forms";

/**
 * Read-only action consumed by the Form Builder agent to inspect an entity's
 * curated form-relevant schema before generating a form Component.
 *
 * Returns the `CuratedFormSchema` shape: FK references resolved to
 * `{entity, displayField}`, value-list fields annotated with `allowedValues`,
 * and audit / virtual / computed fields stripped. See
 * `@memberjunction/interactive-component-types/forms` for the type.
 *
 * Output is stringified JSON in `Message` (Action framework convention) and
 * also surfaced as a `Schema` output parameter for callers that prefer
 * structured access.
 */
@RegisterClass(BaseAction, "__GetEntitySchemaForForm")
export class GetEntitySchemaForFormAction extends BaseAction {

    /**
     * Required input:
     *   - `EntityName` (string) — fully-qualified entity name, e.g. "MJ: Applications".
     *
     * Output:
     *   - `Schema` parameter — the `CuratedFormSchema` object.
     *   - `Message` — the same object, stringified.
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = this.getEntityNameParam(params);
            if (!entityName) {
                return {
                    Success: false,
                    ResultCode: "MISSING_PARAMETER",
                    Message: "Parameter 'EntityName' is required.",
                };
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) {
                return {
                    Success: false,
                    ResultCode: "NO_PROVIDER",
                    Message: "No metadata provider available. Action requires a configured provider on the run params or globally.",
                };
            }

            const schema = buildCuratedFormSchema(entityName, provider);
            if (!schema) {
                return {
                    Success: false,
                    ResultCode: "ENTITY_NOT_FOUND",
                    Message: `Entity '${entityName}' is not registered with the active metadata provider.`,
                };
            }

            params.Params.push({
                Name: "Schema",
                Type: "Output",
                Value: schema,
            });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(schema),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetEntitySchemaForFormAction: ${message}`);
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: message,
            };
        }
    }

    /** Case-insensitive trim-tolerant fetch for the EntityName param. */
    private getEntityNameParam(params: RunActionParams): string | null {
        const param = params.Params.find(p =>
            p.Name?.trim().toLowerCase() === "entityname");
        if (!param || param.Value == null) {
            return null;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : null;
    }
}

/**
 * Tree-shaking guard. Imported and called from src/index.ts so bundlers
 * don't drop the action when no consumer references it by name.
 */
export function LoadGetEntitySchemaForFormAction(): void {
    if (false as boolean) {
        const _: unknown = GetEntitySchemaForFormAction;
    }
}
