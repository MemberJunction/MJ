import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import { getDeclaredFormContribution, type FormContributionSpec } from "@memberjunction/interactive-component-types/forms";
import {
    addOutput, bumpVersion, checkScopedOwnership, failure, getStringParam, insertComponent, lintFormPanelSpec,
    loadComponent, loadContribution, mapToComponentStatus, parseSpecParam, parseVersionBumpKind,
    CONTRIBUTION_KEY_PATTERN, ResolveWriteContributionKey, type VersionBumpKind,
    SerializeClaimedFieldNames,
    ApplySectionClaims,
} from "./_shared";

/**
 * Modify an existing form contribution.
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
 * Any new row is written User-scope — the same security clamp `Create` applies. The row's
 * registration fields are refreshed from the spec's `formContribution` block, so a moved
 * slot or a renamed title lands together with the code that assumes it.
 */
@RegisterClass(BaseAction, "__ModifyFormContribution")
export class ModifyFormContributionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contributionID = getStringParam(params, "ContributionID");
            if (!contributionID) return failure("MISSING_PARAMETER", "Parameter 'ContributionID' is required.");
            const specRaw = params.Params.find(x => x.Name?.trim().toLowerCase() === "spec")?.Value;
            if (specRaw == null) return failure("MISSING_PARAMETER", "Parameter 'Spec' is required.");
            const parsed = parseSpecParam(specRaw);
            if ('error' in parsed) return failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`);
            const spec: ComponentSpec = parsed;
            const notes = getStringParam(params, "Notes");
            const bumpRaw = getStringParam(params, "VersionBumpKind");
            const requestedBump = bumpRaw ? parseVersionBumpKind(bumpRaw) : null;
            if (bumpRaw && !requestedBump) {
                return failure("INVALID_PARAMETER",
                    `VersionBumpKind '${bumpRaw}' is not one of in-place | patch | minor | major.`);
            }

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const source = await loadContribution(provider, user, contributionID);
            if (!source) return failure("CONTRIBUTION_NOT_FOUND", `Contribution '${contributionID}' not found.`);
            const forbidden = checkScopedOwnership(source, user, 'Contribution');
            if (forbidden) return forbidden;

            const lintFail = await lintFormPanelSpec(spec, user);
            if (lintFail) return lintFail;
            const contribution = getDeclaredFormContribution(spec);
            if (!contribution) return failure("LINT_FAILED", "Spec.formContribution could not be read.");

            let relatedEntityID: string | null = null;
            if (contribution.relatedEntity) {
                const related = provider.EntityByName(contribution.relatedEntity);
                if (!related) {
                    return failure("RELATED_ENTITY_NOT_FOUND",
                        `Related entity '${contribution.relatedEntity}' is not registered.`);
                }
                relatedEntityID = related.ID;
                contribution.relatedEntity = related.Name;
            }

            // The key the row will carry — derived for a keyless related claim, exactly as
            // Create does, so the unique index sees it either way.
            const writeKey = ResolveWriteContributionKey(contribution, contribution.relatedEntity ?? null);
            if (writeKey && !CONTRIBUTION_KEY_PATTERN.test(writeKey)) {
                return failure("INVALID_CONTRIBUTION_KEY",
                    `Contribution key '${writeKey}' must match ${CONTRIBUTION_KEY_PATTERN.source}.`);
            }

            const sourceComponent = await loadComponent(provider, user, source.ComponentID);
            if (!sourceComponent) {
                return failure("COMPONENT_NOT_FOUND",
                    `Contribution ${contributionID} points at Component ${source.ComponentID} which no longer exists.`);
            }

            const bump: VersionBumpKind = requestedBump
                ?? (source.Status === 'Pending' ? 'in-place' : source.Status === 'Active' ? 'minor' : 'patch');
            if (bump === 'in-place' && source.Status !== 'Pending') {
                return failure("INVALID_BUMP_FOR_STATUS",
                    `In-place modification is only valid for a Pending contribution; ${contributionID} is ${source.Status}. Supply VersionBumpKind patch | minor | major.`);
            }

            if (bump === 'in-place') {
                return this.modifyInPlace(params, { source, sourceComponent, spec, contribution, writeKey, relatedEntityID, notes });
            }
            return this.createNextVersion(params, { source, sourceComponent, spec, contribution, writeKey, relatedEntityID, notes, bump, provider, user });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ModifyFormContributionAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    /** Overwrite the Pending source's component and refresh its registration fields. */
    private async modifyInPlace(
        params: RunActionParams,
        ctx: {
            source: MJEntityFormContributionEntity;
            sourceComponent: Awaited<ReturnType<typeof loadComponent>> & object;
            spec: ComponentSpec;
            contribution: FormContributionSpec;
            writeKey: string | null;
            relatedEntityID: string | null;
            notes: string | null;
        },
    ): Promise<ActionResultSimple> {
        const { source, sourceComponent, spec, contribution, writeKey, relatedEntityID, notes } = ctx;
        sourceComponent.Specification = JSON.stringify(spec);
        sourceComponent.Title = spec.title ?? sourceComponent.Title;
        sourceComponent.Description = spec.description ?? sourceComponent.Description;
        if (!(await sourceComponent.Save())) {
            return failure("PERSIST_FAILED",
                `Component update failed: ${sourceComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        this.applyRegistration(source, contribution, writeKey, relatedEntityID);
        if (notes) source.Notes = `${source.Notes ? source.Notes + "\n" : ""}${notes}`;
        if (!(await source.Save())) {
            return failure("PERSIST_FAILED",
                `Contribution update failed: ${source.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return this.success(params, {
            ContributionID: source.ID, ComponentID: source.ComponentID,
            Version: sourceComponent.Version ?? '1.0.0', Mode: 'in-place', BumpKind: 'in-place',
        });
    }

    /** Insert a new Pending component + row, superseding the source only when it was Pending. */
    private async createNextVersion(
        params: RunActionParams,
        ctx: {
            source: MJEntityFormContributionEntity;
            sourceComponent: Awaited<ReturnType<typeof loadComponent>> & object;
            spec: ComponentSpec;
            contribution: FormContributionSpec;
            writeKey: string | null;
            relatedEntityID: string | null;
            notes: string | null;
            bump: VersionBumpKind;
            provider: NonNullable<RunActionParams['Provider']>;
            user: NonNullable<RunActionParams['ContextUser']>;
        },
    ): Promise<ActionResultSimple> {
        const { source, sourceComponent, spec, contribution, writeKey, relatedEntityID, notes, bump, provider, user } = ctx;
        const nextVersion = bumpVersion(sourceComponent.Version, bump);
        const componentInsert = await insertComponent({
            provider, user, spec, fallbackName: sourceComponent.Name,
            description: spec.description ?? sourceComponent.Description,
            version: nextVersion, versionSequence: (sourceComponent.VersionSequence ?? 0) + 1,
            componentStatus: 'Pending', componentType: 'Widget',
        });
        if ('error' in componentInsert) return componentInsert.error;

        const row = await provider.GetEntityObject<MJEntityFormContributionEntity>(
            "MJ: Entity Form Contributions", user,
        );
        row.NewRecord();
        row.EntityID = source.EntityID;
        row.ComponentID = componentInsert.id;
        row.Name = source.Name;
        row.Description = spec.description ?? source.Description;
        row.Notes = notes ?? null;
        this.applyRegistration(row, contribution, writeKey, relatedEntityID);
        row.Scope = "User";
        row.UserID = user.ID;
        row.RoleID = null;
        row.Precedence = source.Precedence ?? 0;
        row.Status = 'Pending';
        if (!(await row.Save())) {
            return failure("PERSIST_FAILED",
                `Contribution insert failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'} (Component ${componentInsert.id} persisted).`);
        }

        if (source.Status === 'Pending') {
            // Bumping from a Pending draft supersedes it — there is nothing live to preserve.
            source.Status = 'Inactive';
            await source.Save();
            sourceComponent.Status = mapToComponentStatus('Inactive');
            await sourceComponent.Save();
        }
        return this.success(params, {
            ContributionID: row.ID, ComponentID: componentInsert.id,
            Version: nextVersion, Mode: 'new-version', BumpKind: bump,
        });
    }

    /** Copy the spec's registration intent onto a contribution row. */
    private applyRegistration(
        row: MJEntityFormContributionEntity,
        c: FormContributionSpec,
        writeKey: string | null,
        relatedEntityID: string | null,
    ): void {
        row.Slot = c.slot;
        row.SortKey = c.sortKey ?? 0;
        row.ContributionKey = writeKey;
        row.RelatedEntityID = relatedEntityID;
        row.RelatedJoinField = c.relatedJoinField ?? null;
        row.ReplacesFieldNames = SerializeClaimedFieldNames(c.replacesFieldNames);
        ApplySectionClaims(row, c);
        row.Inclusion = c.inclusion ?? null;
        row.ChromeGroup = c.chromeGroup ?? null;
        row.Presentation = c.presentation;
        row.Title = c.title;
        row.Icon = c.icon ?? null;
        row.Configuration = c.configuration && Object.keys(c.configuration).length > 0
            ? JSON.stringify(c.configuration) : null;
    }

    private success(params: RunActionParams, payload: {
        ContributionID: string; ComponentID: string; Version: string;
        Mode: 'in-place' | 'new-version'; BumpKind: VersionBumpKind;
    }): ActionResultSimple {
        addOutput(params, "ContributionID", payload.ContributionID);
        addOutput(params, "ComponentID", payload.ComponentID);
        addOutput(params, "Version", payload.Version);
        addOutput(params, "Mode", payload.Mode);
        return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
    }
}

export function LoadModifyFormContributionAction(): void {
    if (false as boolean) { const _: unknown = ModifyFormContributionAction; }
}
