import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, UserInfo, IMetadataProvider } from "@memberjunction/core";
import {
    MJComponentEntity,
    MJEntityFormOverrideEntity,
} from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { ComponentSpec } from "@memberjunction/interactive-component-types";
import { isFormRole } from "@memberjunction/interactive-component-types/forms";
import { ComponentLinter } from "@memberjunction/react-test-harness";

/**
 * Persists an AI-authored or human-authored runtime form. Lints the
 * supplied `ComponentSpec`, inserts a `MJ: Components` row, then inserts a
 * `MJ: Entity Form Overrides` row that activates the form for the calling
 * user.
 *
 * **Security boundary — Scope clamping.** The action *always* writes
 * `Scope='User', UserID=ctx.user.ID, Status='Active', Priority=0`,
 * regardless of any scope-related parameter the caller might supply.
 * This is the load-bearing safety property of the AI authoring path:
 * an agent (or anything else invoking this action) cannot write Global
 * or Role overrides that would affect other users. Promotion to broader
 * scope is a separate, deliberate human action in Component Studio.
 *
 * **Failure mode.** Fail-hard on lint errors — nothing is persisted. The
 * caller (typically the Form Builder agent) reads the error message and
 * retries within its Loop iteration budget. No partial persistence, no
 * "Pending" rows.
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
            if ('error' in inputs) {
                return inputs.error;
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) {
                return failure("NO_PROVIDER", "No metadata provider available.");
            }

            const user = params.ContextUser;
            if (!user) {
                return failure("NO_USER", "Action requires a ContextUser to clamp override scope.");
            }

            const entityInfo = provider.EntityByName(inputs.EntityName);
            if (!entityInfo) {
                return failure(
                    "ENTITY_NOT_FOUND",
                    `Entity '${inputs.EntityName}' is not registered with the active metadata provider.`,
                );
            }

            // Linter gate. Both checks fail-hard with messages the agent can
            // read and retry on.
            const lintFail = await this.lintSpec(inputs.Spec, user);
            if (lintFail) {
                return lintFail;
            }

            // Component row first — it's the artifact. Override points at it.
            const componentResult = await this.persistComponent(
                inputs.Spec, inputs.Name, inputs.Description, provider, user,
            );
            if ('error' in componentResult) {
                return componentResult.error;
            }
            const componentID = componentResult.id;

            // Override row — always User scope, regardless of args.
            const overrideResult = await this.persistOverride(
                entityInfo.ID, componentID, inputs.Name, inputs.Description, user, provider,
            );
            if ('error' in overrideResult) {
                // Component is in the table without an override. That's fine —
                // it just doesn't render anywhere. Document the situation in
                // the error so the caller knows what state they're in.
                return failure(
                    "PERSIST_FAILED",
                    `${overrideResult.error.Message} (Component ${componentID} was persisted but has no override yet.)`,
                );
            }

            this.addOutput(params, "ComponentID", componentID);
            this.addOutput(params, "OverrideID", overrideResult.id);

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    ComponentID: componentID,
                    OverrideID: overrideResult.id,
                    EntityName: inputs.EntityName,
                    Scope: "User",
                    Status: "Active",
                }),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`CreateInteractiveFormAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    /**
     * Pull and validate the four input params. Returns either the typed
     * inputs or a structured error result the caller bubbles up. Errors
     * use MISSING_PARAMETER per the documented result codes.
     */
    private extractInputs(params: RunActionParams):
        | { EntityName: string; Spec: ComponentSpec; Name: string; Description: string | null }
        | { error: ActionResultSimple }
    {
        const entityName = this.getStringParam(params, "EntityName");
        if (!entityName) {
            return { error: failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.") };
        }

        const name = this.getStringParam(params, "Name");
        if (!name) {
            return { error: failure("MISSING_PARAMETER", "Parameter 'Name' is required.") };
        }

        const description = this.getStringParam(params, "Description");

        const specRaw = this.getParam(params, "Spec");
        if (specRaw == null) {
            return { error: failure("MISSING_PARAMETER", "Parameter 'Spec' is required.") };
        }

        let spec: ComponentSpec;
        try {
            // Spec may arrive as either a parsed object (Form Builder calling
            // directly with structured args) or as a JSON string (HTTP / REST
            // callers, mj-sync, etc.).
            spec = typeof specRaw === "string"
                ? (JSON.parse(specRaw) as ComponentSpec)
                : (specRaw as ComponentSpec);
        } catch (err) {
            return { error: failure(
                "LINT_FAILED",
                `Spec is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
            ) };
        }

        return {
            EntityName: entityName,
            Spec: spec,
            Name: name,
            Description: description ?? null,
        };
    }

    /**
     * Lint the spec for both shape and form-role-contract compliance.
     *
     * Shape checks (always run, cheap, deterministic):
     *   - componentRole === 'form'
     *   - spec.name is set
     *   - spec.code is a non-empty string
     *   - spec.location is set
     *
     * Code-level checks via {@link ComponentLinter} (if any violations of
     * severity 'error' or 'critical' are returned, fail). This catches
     * structural problems with the JSX itself — bad imports, undeclared
     * identifiers, etc.
     */
    private async lintSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
        if (!isFormRole(spec)) {
            return failure(
                "LINT_FAILED",
                `Spec must declare componentRole='form'. Got '${spec.componentRole ?? "(unset)"}'. The InteractiveForm runtime refuses to mount any other role.`,
            );
        }
        if (!spec.name || spec.name.trim().length === 0) {
            return failure("LINT_FAILED", "Spec.name is required.");
        }
        if (typeof spec.code !== "string" || spec.code.trim().length === 0) {
            return failure("LINT_FAILED", "Spec.code must be a non-empty JSX string.");
        }
        if (!spec.location) {
            return failure(
                "LINT_FAILED",
                "Spec.location is required (use 'embedded' for inline JSX or 'registry' to reference a published component).",
            );
        }

        // Code-level check. The linter parses the JSX, checks prop
        // destructuring, undeclared identifiers, missing returns, etc.
        // We treat any error/critical violation as a hard failure but
        // ignore warnings — those are advisory and shouldn't block AI
        // authoring iteration.
        //
        // Rules suppressed for form-role components:
        //   - `component-props-validation`: form-role components receive
        //     FormHostProps (entityName, primaryKey, record, entityMetadata,
        //     mode, canEdit, canDelete, canCreate) injected by the host
        //     wrapper. The linter (which predates form-role) only knows
        //     about the 6 standard IC props and flags these as "undeclared".
        //   - `callback-event-validation`: `NotifyEvent` is a documented
        //     ComponentCallbacks method (see runtime-types.ts:37) but the
        //     linter's allowlist doesn't include it. Forms rely on
        //     NotifyEvent to emit BeforeSave / BeforeDelete /
        //     EditModeChangeRequested.
        //
        // Real lint signal (undefined fields, malformed RunView usage,
        // syntax errors) still blocks — we suppress two specific rules,
        // not the linter itself.
        const FORM_ROLE_SUPPRESSED_RULES = new Set([
            "component-props-validation",
            "callback-event-validation",
        ]);
        try {
            const result = await ComponentLinter.lintComponent(
                spec.code, spec.name, spec, true, contextUser,
            );
            const blocking = (result.violations ?? []).filter(v => {
                const isBlocking = v.severity === "critical" || v.severity === "high";
                if (!isBlocking) return false;
                if (v.rule && FORM_ROLE_SUPPRESSED_RULES.has(v.rule)) return false;
                return true;
            });
            if (blocking.length > 0) {
                const messages = blocking
                    .slice(0, 5)
                    .map(v => `  [${v.severity}] ${v.rule ?? "lint"}: ${v.message}${v.line ? ` (line ${v.line})` : ""}`)
                    .join("\n");
                return failure(
                    "LINT_FAILED",
                    `Spec code failed linting:\n${messages}${blocking.length > 5 ? `\n  (+${blocking.length - 5} more)` : ""}`,
                );
            }
        } catch (err) {
            // ComponentLinter itself blew up (parse error etc.). Surface the
            // error so the agent retries with corrected code.
            return failure(
                "LINT_FAILED",
                `Linter could not parse spec code: ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        return null;
    }

    /**
     * Insert the `MJ: Components` row. Sets Type='Form' so consumers that
     * filter by Type still see this Component; Status='Published' so it's
     * eligible for resolution; Version='1.0.0' (we don't have a meaningful
     * version concept on author-time creation — Studio's version flow
     * handles bumps).
     */
    private async persistComponent(
        spec: ComponentSpec,
        name: string,
        description: string | null,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ id: string } | { error: ActionResultSimple }> {
        const component = await provider.GetEntityObject<MJComponentEntity>("MJ: Components", user);
        component.NewRecord();
        component.Name = spec.name ?? name;
        component.Title = spec.title ?? name;
        component.Description = description ?? spec.description ?? null;
        component.Type = "Form";
        component.Status = "Published";
        component.Version = "1.0.0";
        component.VersionSequence = 1;
        component.Specification = JSON.stringify(spec);
        component.DeveloperName = user.Name ?? null;

        const saved = await component.Save();
        if (!saved) {
            return { error: failure(
                "PERSIST_FAILED",
                `Component insert failed: ${component.LatestResult?.CompleteMessage ?? "unknown error"}`,
            ) };
        }
        return { id: component.ID };
    }

    /**
     * Insert the `MJ: Entity Form Overrides` row. Scope is hard-coded
     * to 'User' as the security clamp — see class-level docs.
     */
    private async persistOverride(
        entityID: string,
        componentID: string,
        name: string,
        description: string | null,
        user: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ id: string } | { error: ActionResultSimple }> {
        const override = await provider.GetEntityObject<MJEntityFormOverrideEntity>(
            "MJ: Entity Form Overrides", user,
        );
        override.NewRecord();
        override.EntityID = entityID;
        override.ComponentID = componentID;
        override.Name = name;
        override.Description = description;
        // Clamp: the agent does not get to choose scope. User-only writes
        // mean the blast radius of a bad AI-generated form is bounded to
        // the requester.
        override.Scope = "User";
        override.UserID = user.ID;
        override.RoleID = null;
        override.Priority = 0;
        override.Status = "Active";

        const saved = await override.Save();
        if (!saved) {
            return { error: failure(
                "PERSIST_FAILED",
                `Override insert failed: ${override.LatestResult?.CompleteMessage ?? "unknown error"}`,
            ) };
        }
        return { id: override.ID };
    }

    // ── parameter helpers ──────────────────────────────────────────────

    private getParam(params: RunActionParams, name: string): unknown {
        const p = params.Params.find(x =>
            x.Name?.trim().toLowerCase() === name.toLowerCase());
        return p?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | null {
        const v = this.getParam(params, name);
        if (v == null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
    }

    private addOutput(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: "Output", Value: value });
    }
}

function failure(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
}

/**
 * Tree-shaking guard. Imported and called from src/index.ts so bundlers
 * don't drop the action when no consumer references it by name.
 */
export function LoadCreateInteractiveFormAction(): void {
    if (false as boolean) {
        const _: unknown = CreateInteractiveFormAction;
    }
}
