import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";

/**
 * Read-only action that returns the currently-resolved interactive-form
 * override (if any) for the (entity, user) pair plus the full list of
 * applicable variants. Used by the Form Builder agent to decide between
 * Create (no override exists) and Modify (an override already exists).
 *
 * Resolution mirrors {@link FormResolverService} on the client:
 *   - Scope precedence: User > Role > Global.
 *   - Within a tier: Priority DESC, then __mj_CreatedAt DESC.
 *   - Only Status='Active' rows are considered for the "active" pick. The
 *     full variants list includes 'Pending' rows so the agent can recognize
 *     an in-flight refinement loop and reuse the Pending row instead of
 *     spawning a new one.
 *
 * Output shape (JSON in `Message`, also surfaced as a `Result` output param):
 * ```
 * {
 *   "EntityName": "MJ: Applications",
 *   "Active": {
 *     "OverrideID": "...",
 *     "ComponentID": "...",
 *     "Scope": "User" | "Role" | "Global",
 *     "Priority": 0,
 *     "Status": "Active",
 *     "Spec": <ComponentSpec>,
 *     "ComponentName": "...",
 *     "ComponentVersion": "1.0.0",
 *     "VersionSequence": 1
 *   } | null,
 *   "Variants": [{ ...same shape... }, ...]   // all applicable, all statuses
 * }
 * ```
 *
 * If no overrides exist, `Active` is null and `Variants` is empty —
 * the calling agent should then call `Get Default Form Scaffold For Entity`
 * and `Create Interactive Form`.
 */
@RegisterClass(BaseAction, "__GetActiveFormForEntity")
export class GetActiveFormForEntityAction extends BaseAction {

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

            const user = params.ContextUser;
            if (!user) {
                return failure("NO_USER", "Action requires a ContextUser for scope resolution.");
            }

            const entity = provider.EntityByName(entityName);
            if (!entity) {
                return failure(
                    "ENTITY_NOT_FOUND",
                    `Entity '${entityName}' is not registered with the active metadata provider.`,
                );
            }

            // Pull all overrides applicable to this user — User-scoped to this user,
            // Role-scoped if user has any of the listed roles, or Global. We let the
            // database filter and we sort + select winner in code below.
            const rv = RunView.FromMetadataProvider(provider);
            const userRoles: string[] = Array.isArray((user as { UserRoles?: { RoleID?: string }[] }).UserRoles)
                ? ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? []).map(r => r.RoleID).filter((x): x is string => !!x)
                : [];

            const filterClauses: string[] = [
                `EntityID='${entity.ID}'`,
                `(Scope='Global' OR (Scope='User' AND UserID='${user.ID}')${userRoles.length ? ` OR (Scope='Role' AND RoleID IN (${userRoles.map(r => `'${r}'`).join(",")}))` : ''})`,
            ];

            const overrideResult = await rv.RunView<{
                ID: string;
                EntityID: string;
                ComponentID: string;
                Name: string;
                Description: string | null;
                Scope: 'User' | 'Role' | 'Global';
                UserID: string | null;
                RoleID: string | null;
                Priority: number;
                Status: 'Active' | 'Inactive' | 'Pending';
            }>({
                EntityName: "MJ: Entity Form Overrides",
                ExtraFilter: filterClauses.join(' AND '),
                Fields: ['ID', 'EntityID', 'ComponentID', 'Name', 'Description', 'Scope', 'UserID', 'RoleID', 'Priority', 'Status'],
                ResultType: 'simple',
            }, user);

            if (!overrideResult.Success) {
                return failure(
                    "QUERY_FAILED",
                    `Override lookup failed: ${overrideResult.ErrorMessage ?? 'unknown error'}`,
                );
            }

            const overrides = overrideResult.Results ?? [];
            if (overrides.length === 0) {
                const payload = { EntityName: entityName, Active: null, Variants: [] };
                params.Params.push({ Name: "Result", Type: "Output", Value: payload });
                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: JSON.stringify(payload),
                };
            }

            // Hydrate the referenced Components in one batch.
            const componentIDs = Array.from(new Set(overrides.map(o => o.ComponentID))).filter(Boolean);
            const componentsResult = await rv.RunView<{
                ID: string;
                Name: string;
                Version: string;
                VersionSequence: number;
                Status: string;
                Specification: string;
            }>({
                EntityName: "MJ: Components",
                ExtraFilter: `ID IN (${componentIDs.map(id => `'${id}'`).join(",")})`,
                Fields: ['ID', 'Name', 'Version', 'VersionSequence', 'Status', 'Specification'],
                ResultType: 'simple',
            }, user);

            const componentByID = new Map(
                (componentsResult.Results ?? []).map(c => [c.ID, c]),
            );

            type VariantRow = {
                OverrideID: string;
                ComponentID: string;
                Scope: 'User' | 'Role' | 'Global';
                Priority: number;
                Status: 'Active' | 'Inactive' | 'Pending';
                Name: string;
                Description: string | null;
                Spec: ComponentSpec | null;
                ComponentName: string | null;
                ComponentVersion: string | null;
                VersionSequence: number | null;
            };

            const variants: VariantRow[] = overrides.map(o => {
                const component = componentByID.get(o.ComponentID);
                let spec: ComponentSpec | null = null;
                if (component?.Specification) {
                    try {
                        spec = JSON.parse(component.Specification) as ComponentSpec;
                    } catch {
                        // Bad spec JSON — we don't fail the whole action; we surface
                        // the variant without a parsed spec and let the caller decide.
                        spec = null;
                    }
                }
                return {
                    OverrideID: o.ID,
                    ComponentID: o.ComponentID,
                    Scope: o.Scope,
                    Priority: o.Priority ?? 0,
                    Status: o.Status,
                    Name: o.Name,
                    Description: o.Description,
                    Spec: spec,
                    ComponentName: component?.Name ?? null,
                    ComponentVersion: component?.Version ?? null,
                    VersionSequence: component?.VersionSequence ?? null,
                };
            });

            // Sort by scope tier (User=1, Role=2, Global=3), then Priority DESC.
            // We don't have CreatedAt in the lightweight query — ties at this
            // point default to the order the DB returned, which is usually
            // creation order. The resolver service does the same.
            variants.sort((a, b) => {
                const tierA = a.Scope === 'User' ? 1 : a.Scope === 'Role' ? 2 : 3;
                const tierB = b.Scope === 'User' ? 1 : b.Scope === 'Role' ? 2 : 3;
                if (tierA !== tierB) return tierA - tierB;
                return (b.Priority ?? 0) - (a.Priority ?? 0);
            });

            const active = variants.find(v => v.Status === 'Active') ?? null;
            const payload = { EntityName: entityName, Active: active, Variants: variants };

            params.Params.push({ Name: "Result", Type: "Output", Value: payload });
            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(payload),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetActiveFormForEntityAction: ${message}`);
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
export function LoadGetActiveFormForEntityAction(): void {
    if (false as boolean) {
        const _: unknown = GetActiveFormForEntityAction;
    }
}
