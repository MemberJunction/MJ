import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    AddOutput,
    Failure,
    GetNumberParam,
    GetStringParam,
    InsertComponent,
    InsertContribution,
    LintFormPanelSpec,
    ParseSpecParam,
    ResolveContributionRegistration,
} from "./_shared";

/**
 * Create a net-new form contribution for the requesting user.
 *
 * Reads the registration intent from `spec.formContribution` (slot, key, claims,
 * presentation, title). Writes a `MJ: Components` row (Type='Widget', v1.0.0, Draft)
 * and a `MJ: Entity Form Contributions` row (Scope='User', Status='Pending').
 * Activation is a separate step (`Activate Form Contribution Version`), which the
 * "Add to my form" apply flow runs immediately after Create.
 *
 * **Security clamp — Scope.** This action *always* writes `Scope='User'`,
 * `UserID=ctx.user.ID`. An agent cannot write Global or Role contributions that would
 * change other users' forms. Promotion is a deliberate human act.
 *
 * `Precedence` is honored when supplied (the apply flow passes `incumbent + 1` after
 * the user confirms replacing an installed contribution). It only ever affects the
 * calling user's own form, so it is not clamped.
 *
 * **Atomicity.** If the contribution insert fails after the Component insert succeeded,
 * PERSIST_FAILED names the orphan Component. Orphan Components render nowhere until a
 * row points at them, so a retry is safe.
 */
@RegisterClass(BaseAction, "__CreateFormContribution")
export class CreateFormContributionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const inputs = this.extractInputs(params);
            if ('error' in inputs) return inputs.error;

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser to clamp contribution scope.");

            const entityInfo = provider.EntityByName(inputs.EntityName);
            if (!entityInfo) {
                return Failure("ENTITY_NOT_FOUND",
                    `Entity '${inputs.EntityName}' is not registered with the active metadata provider.`);
            }

            // Lint before any persistence — fail-hard.
            const lintFail = await LintFormPanelSpec(inputs.Spec, user);
            if (lintFail) return lintFail;

            const registration = ResolveContributionRegistration(provider, inputs.Spec);
            if ('error' in registration) return registration.error;

            // The duplicate check runs before the Component row is written, so a rejected
            // create leaves nothing behind.
            const writeKey = registration.WriteKey;
            const keyCheck = writeKey
                ? await this.checkKeyAvailable(provider, user, entityInfo.ID, inputs.EntityName, writeKey)
                : null;
            if (keyCheck) return keyCheck;

            const componentInsert = await InsertComponent({
                provider, user, spec: inputs.Spec, fallbackName: inputs.Name, description: inputs.Description,
                version: "1.0.0", versionSequence: 1, componentStatus: 'Pending', componentType: 'Widget',
            });
            if ('error' in componentInsert) return componentInsert.error;

            const rowInsert = await InsertContribution({
                provider, user, entityID: entityInfo.ID, componentID: componentInsert.id,
                name: inputs.Name, description: inputs.Description, notes: inputs.Notes,
                registration, status: 'Pending', precedence: inputs.Precedence,
            });
            if ('error' in rowInsert) {
                return Failure("PERSIST_FAILED",
                    `${rowInsert.error.Message} (Component ${componentInsert.id} was persisted but has no contribution row yet.)`);
            }

            AddOutput(params, "ContributionID", rowInsert.id);
            AddOutput(params, "ComponentID", componentInsert.id);
            AddOutput(params, "Version", "1.0.0");
            return {
                Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    ContributionID: rowInsert.id, ComponentID: componentInsert.id, EntityName: entityInfo.Name,
                    ContributionKey: writeKey, Slot: registration.Contribution.slot,
                    Scope: "User", Status: "Pending", Version: "1.0.0",
                }),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`CreateFormContributionAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }

    /**
     * Rejects a key the caller already holds on this entity, and fails with QUERY_FAILED when
     * that cannot be checked. Covers derived keys too, because the key it tests is the one the
     * row will actually carry.
     */
    private async checkKeyAvailable(
        provider: NonNullable<RunActionParams['Provider']>,
        user: NonNullable<RunActionParams['ContextUser']>,
        entityID: string,
        entityName: string,
        writeKey: string,
    ): Promise<ActionResultSimple | null> {
        const rv = RunView.FromMetadataProvider(provider);
        const dup = await rv.RunView<{ ID: string; Status: string }>({
            EntityName: "MJ: Entity Form Contributions",
            ExtraFilter: `EntityID='${EscapeSQLString(entityID)}' AND Scope='User' AND UserID='${EscapeSQLString(user.ID)}' AND ContributionKey='${EscapeSQLString(writeKey)}' AND Status IN ('Active','Pending')`,
            Fields: ['ID', 'Status'], ResultType: 'simple', MaxRows: 1,
        }, user);
        if (!dup.Success) {
            return Failure("QUERY_FAILED", `Duplicate-key lookup failed: ${dup.ErrorMessage ?? 'unknown error'}`);
        }
        if ((dup.Results ?? []).length > 0) {
            const existing = dup.Results![0];
            return Failure("ALREADY_EXISTS",
                `A ${existing.Status} User-scope contribution '${writeKey}' already exists on '${entityName}' (ContributionID=${existing.ID}). Use 'Modify Form Contribution' on it.`);
        }
        return null;
    }

    private extractInputs(params: RunActionParams):
        | { EntityName: string; Spec: ComponentSpec; Name: string; Description: string | null; Notes: string | null; Precedence: number }
        | { error: ActionResultSimple }
    {
        const entityName = GetStringParam(params, "EntityName");
        if (!entityName) return { error: Failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.") };
        const name = GetStringParam(params, "Name");
        if (!name) return { error: Failure("MISSING_PARAMETER", "Parameter 'Name' is required.") };
        const specRaw = params.Params.find(x => x.Name?.trim().toLowerCase() === "spec")?.Value;
        if (specRaw == null) return { error: Failure("MISSING_PARAMETER", "Parameter 'Spec' is required.") };
        const parsed = ParseSpecParam(specRaw);
        if ('error' in parsed) return { error: Failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`) };
        const precedence = GetNumberParam(params, "Precedence");
        return {
            EntityName: entityName, Spec: parsed, Name: name,
            Description: GetStringParam(params, "Description"), Notes: GetStringParam(params, "Notes"),
            Precedence: precedence != null && precedence >= 0 ? Math.floor(precedence) : 0,
        };
    }
}

export function LoadCreateFormContributionAction(): void {
    if (false as boolean) { const _: unknown = CreateFormContributionAction; }
}
