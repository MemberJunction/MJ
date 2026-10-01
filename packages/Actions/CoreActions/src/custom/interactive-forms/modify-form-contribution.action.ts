import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { ApplyContributionSpecToRow, type MJComponentEntity, type MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    AddOutput,
    BumpVersion,
    CheckOwnContributionWrite,
    Failure,
    GetPrecedenceParam,
    GetStringParam,
    InsertComponent,
    InsertContribution,
    LintFormPanelSpec,
    LoadComponent,
    LoadContribution,
    MapToComponentStatus,
    ParseSpecParam,
    ParseVersionBumpKind,
    ResolveContributionRegistration,
    WriteAtomically,
    type ContributionRegistration,
    type VersionBumpKind,
} from "./_shared";

/** The action's inputs, read and checked. */
interface ModifyInputs {
    ContributionID: string;
    Spec: ComponentSpec;
    Notes: string | null;
    Bump: VersionBumpKind | null;
    /** The row's precedence when supplied; null keeps the source row's. */
    Precedence: number | null;
}

/** What both write paths need. */
interface ModifyContext {
    source: MJEntityFormContributionEntity;
    sourceComponent: MJComponentEntity;
    registration: ContributionRegistration;
    inputs: ModifyInputs;
    provider: NonNullable<RunActionParams['Provider']>;
    user: NonNullable<RunActionParams['ContextUser']>;
}

/** A failed step, in the shape the shared helpers return. From a write step it rolls the transaction back. */
type StepFailure = { error: ActionResultSimple };

/** What a successful modification reports. */
interface ModifyPayload {
    ContributionID: string;
    ComponentID: string;
    Version: string;
    Mode: 'in-place' | 'new-version';
    BumpKind: VersionBumpKind;
}

/**
 * Modify one of the caller's own form contributions.
 *
 * | Source Status | `VersionBumpKind` | Behavior |
 * |---|---|---|
 * | Pending | `in-place` (default) | Overwrite the source Component's spec; refresh the row's registration fields; append Notes |
 * | Pending | `patch`/`minor`/`major` | Supersede source row + component; insert new Pending component + row |
 * | Active | `in-place` | `INVALID_BUMP_FOR_STATUS` |
 * | Active | bump (default `minor`) | New Pending component + row; the live Active row is untouched |
 * | Inactive | `in-place` | `INVALID_BUMP_FOR_STATUS` |
 * | Inactive | bump (default `patch`) | Branch from the historical version: new Pending component + row |
 *
 * Only the caller's own User-scope rows can be modified; a Role or Global row, or another user's
 * row, returns `FORBIDDEN` (shared panels are managed from the form's Manage drawer or Form
 * Builder). A new row is written User-scope, as `Create` writes it. The row's registration fields
 * are refreshed from the spec's `formContribution` block, so a moved slot or a renamed title lands
 * together with the code that assumes it. An optional `Precedence` replaces the row's precedence.
 *
 * The spec's claim is checked (`INVALID_CLAIM`) before anything is written, and the component and
 * row writes run in one entity transaction, so a refused row save leaves the component unchanged.
 */
@RegisterClass(BaseAction, "__ModifyFormContribution")
export class ModifyFormContributionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const inputs = this.extractInputs(params);
            if ('error' in inputs) return inputs.error;
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return Failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return Failure("NO_USER", "Action requires a ContextUser.");

            const source = await LoadContribution(provider, user, inputs.ContributionID);
            if (!source) return Failure("CONTRIBUTION_NOT_FOUND", `Contribution '${inputs.ContributionID}' not found.`);
            const forbidden = CheckOwnContributionWrite(source, user, provider);
            if (forbidden) return forbidden;

            const lintFail = await LintFormPanelSpec(inputs.Spec, user);
            if (lintFail) return lintFail;
            const registration = ResolveContributionRegistration(provider, inputs.Spec, source.ContributionKey);
            if ('error' in registration) return registration.error;

            const sourceComponent = await LoadComponent(provider, user, source.ComponentID);
            if (!sourceComponent) {
                return Failure("COMPONENT_NOT_FOUND",
                    `Contribution ${source.ID} points at Component ${source.ComponentID} which no longer exists.`);
            }
            const bump: VersionBumpKind = inputs.Bump
                ?? (source.Status === 'Pending' ? 'in-place' : source.Status === 'Active' ? 'minor' : 'patch');
            if (bump === 'in-place' && source.Status !== 'Pending') {
                return Failure("INVALID_BUMP_FOR_STATUS",
                    `In-place modification is only valid for a Pending contribution; ${source.ID} is ${source.Status}. Supply VersionBumpKind patch | minor | major.`);
            }

            const ctx: ModifyContext = { source, sourceComponent, registration, inputs, provider, user };
            const written = await WriteAtomically(provider, () =>
                bump === 'in-place' ? this.modifyInPlace(ctx) : this.createNextVersion(ctx, bump));
            if ('error' in written) return written.error;
            return this.success(params, written);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ModifyFormContributionAction: ${message}`);
            return Failure("UNEXPECTED_ERROR", message);
        }
    }

    private extractInputs(params: RunActionParams): ModifyInputs | StepFailure {
        const contributionID = GetStringParam(params, "ContributionID");
        if (!contributionID) return { error: Failure("MISSING_PARAMETER", "Parameter 'ContributionID' is required.") };
        const specRaw = params.Params.find(x => x.Name?.trim().toLowerCase() === "spec")?.Value;
        if (specRaw == null) return { error: Failure("MISSING_PARAMETER", "Parameter 'Spec' is required.") };
        const parsed = ParseSpecParam(specRaw);
        if ('error' in parsed) return { error: Failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`) };
        const bumpRaw = GetStringParam(params, "VersionBumpKind");
        const bump = bumpRaw ? ParseVersionBumpKind(bumpRaw) : null;
        if (bumpRaw && !bump) {
            return { error: Failure("INVALID_PARAMETER",
                `VersionBumpKind '${bumpRaw}' is not one of in-place | patch | minor | major.`) };
        }
        return {
            ContributionID: contributionID, Spec: parsed, Notes: GetStringParam(params, "Notes"),
            Bump: bump, Precedence: GetPrecedenceParam(params),
        };
    }

    /** Overwrite the Pending source's component and refresh its registration fields. */
    private async modifyInPlace(ctx: ModifyContext): Promise<ModifyPayload | StepFailure> {
        const { source, sourceComponent, registration, inputs } = ctx;
        const spec = inputs.Spec;
        sourceComponent.Specification = JSON.stringify(spec);
        sourceComponent.Title = spec.title ?? sourceComponent.Title;
        sourceComponent.Description = spec.description ?? sourceComponent.Description;
        if (!(await sourceComponent.Save())) {
            return { error: Failure("PERSIST_FAILED",
                `Component update failed: ${sourceComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`) };
        }
        ApplyContributionSpecToRow(source, registration.Contribution, registration.RowOptions);
        if (inputs.Precedence != null) source.Precedence = inputs.Precedence;
        if (inputs.Notes) source.Notes = `${source.Notes ? source.Notes + "\n" : ""}${inputs.Notes}`;
        if (!(await source.Save())) {
            return { error: Failure("PERSIST_FAILED",
                `Contribution update failed: ${source.LatestResult?.CompleteMessage ?? 'unknown error'}`) };
        }
        return {
            ContributionID: source.ID, ComponentID: source.ComponentID,
            Version: sourceComponent.Version ?? '1.0.0', Mode: 'in-place', BumpKind: 'in-place',
        };
    }

    /** Insert a new Pending component + User-scope row, superseding the source only when it was Pending. */
    private async createNextVersion(ctx: ModifyContext, bump: VersionBumpKind): Promise<ModifyPayload | StepFailure> {
        const { source, sourceComponent, registration, inputs, provider, user } = ctx;
        const spec = inputs.Spec;
        const nextVersion = BumpVersion(sourceComponent.Version, bump);
        const componentInsert = await InsertComponent({
            provider, user, spec, fallbackName: sourceComponent.Name,
            description: spec.description ?? sourceComponent.Description,
            version: nextVersion, versionSequence: (sourceComponent.VersionSequence ?? 0) + 1,
            componentStatus: 'Pending', componentType: 'Widget',
        });
        if ('error' in componentInsert) return componentInsert;

        const rowInsert = await InsertContribution({
            provider, user, entityID: source.EntityID, componentID: componentInsert.id,
            name: source.Name, description: spec.description ?? source.Description, notes: inputs.Notes,
            registration, status: 'Pending', precedence: inputs.Precedence ?? source.Precedence ?? 0,
        });
        if ('error' in rowInsert) return rowInsert;

        if (source.Status === 'Pending') {
            // Bumping from a Pending draft supersedes it — there is nothing live to preserve.
            const superseded = await this.supersede(source, sourceComponent);
            if (superseded) return superseded;
        }
        return {
            ContributionID: rowInsert.id, ComponentID: componentInsert.id,
            Version: nextVersion, Mode: 'new-version', BumpKind: bump,
        };
    }

    /** Mark the source row and its component Inactive; a refused save fails the whole modification. */
    private async supersede(
        source: MJEntityFormContributionEntity,
        sourceComponent: MJComponentEntity,
    ): Promise<StepFailure | null> {
        source.Status = 'Inactive';
        if (!(await source.Save())) {
            return { error: Failure("PERSIST_FAILED",
                `Could not supersede contribution ${source.ID}: ${source.LatestResult?.CompleteMessage ?? 'unknown error'}`) };
        }
        sourceComponent.Status = MapToComponentStatus('Inactive');
        if (!(await sourceComponent.Save())) {
            return { error: Failure("PERSIST_FAILED",
                `Could not supersede component ${sourceComponent.ID}: ${sourceComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`) };
        }
        return null;
    }

    private success(params: RunActionParams, payload: ModifyPayload): ActionResultSimple {
        AddOutput(params, "ContributionID", payload.ContributionID);
        AddOutput(params, "ComponentID", payload.ComponentID);
        AddOutput(params, "Version", payload.Version);
        AddOutput(params, "Mode", payload.Mode);
        return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
    }
}

export function LoadModifyFormContributionAction(): void {
    if (false as boolean) { const _: unknown = ModifyFormContributionAction; }
}
