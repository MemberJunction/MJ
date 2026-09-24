/**
 * Apply-to-my-form service.
 *
 * When the form-aware artifact viewer's "Apply to my form" button fires
 * `applyFormRequested`, the host calls this service. It:
 *   1. Looks up the entity to confirm it's registered.
 *   2. Reads the current Active override for the (entity, user) pair via
 *      the `Get Active Form For Entity` action.
 *   3. Shows a confirmation dialog explaining what's about to happen
 *      (Create new vs. Modify existing → Pending).
 *   4. On confirmation, runs `Create Interactive Form` or
 *      `Modify Interactive Form` accordingly.
 *   5. Surfaces success / failure via the notification service.
 *
 * The service centralizes the Create-vs-Modify decision so every host
 * (standalone artifact viewer in Explorer, chat conversation surfaces,
 * eventually the cockpit's chat-pane Apply flow) follows the same rules.
 */
import { Injectable, inject } from '@angular/core';
import { Metadata, LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    getDeclaredFormContribution, isFormPanelRole,
    type FormContributionSlot, type FormContributionSpec,
} from '@memberjunction/interactive-component-types/forms';
import {
    ApplyDecisionToSpec, MjFormPlacementDialogComponent,
    type FormCompositionSnapshot, type FormPlacementContext, type FormPlacementDecision,
} from '@memberjunction/ng-base-forms';

/** Result of an apply attempt — surfaced to the caller for any post-apply UI. */
export interface InteractiveFormApplyResult {
    Success: boolean;
    /** `'form'` for a whole-form override, `'contribution'` for a single form panel. */
    Kind?: 'form' | 'contribution';
    /** Mode the server ran: 'create' / 'modify-new-version' / 'modify-in-place'. */
    Mode?: 'create' | 'modify-new-version' | 'modify-in-place';
    /** OverrideID the user can now reference. */
    OverrideID?: string;
    /** Contribution row the user can now reference — panel applies only. */
    ContributionID?: string;
    /** ComponentID that now holds the spec. */
    ComponentID?: string;
    /** Version string (e.g. '1.0.0' for create, '1.1.0' for modify-new). */
    Version?: string;
    Message?: string;
}

/** The subset of a `Get Form Contributions For Entity` row this service reads. */
interface ParsedContribution {
    ContributionID: string;
    ContributionKey: string | null;
    Status: string;
    Scope: string;
    Name?: string;
    ComponentName?: string | null;
}

@Injectable({ providedIn: 'root' })
export class InteractiveFormApplyService {
    private readonly dialog = inject(MJDialogService);
    private readonly notifications = inject(MJNotificationService);

    /**
     * Confirm with the user and apply the spec. Routes to Create / Modify
     * automatically based on whether an Active override already exists.
     */
    public async ConfirmAndApply(
        spec: ComponentSpec,
        entityName: string,
        provider?: IMetadataProvider,
        snapshot: FormCompositionSnapshot | null = null,
    ): Promise<InteractiveFormApplyResult> {
        const p = provider ?? Metadata.Provider;
        if (!p) {
            return this.fail('No metadata provider configured.');
        }
        const entity = p.EntityByName(entityName);
        if (!entity) {
            return this.fail(`Entity '${entityName}' is not registered.`);
        }
        const user = p.CurrentUser;
        if (!user) {
            return this.fail('No current user.');
        }
        const gqlProvider = p as unknown as GraphQLDataProvider;
        if (!gqlProvider || typeof (gqlProvider as { ExecuteGQL?: unknown }).ExecuteGQL !== 'function') {
            return this.fail('Action invocation requires a GraphQL provider.');
        }

        const client = new GraphQLActionClient(gqlProvider);

        // A form panel is a contribution, not a whole-form override — a different
        // action family and a different set of confirmations.
        if (isFormPanelRole(spec)) {
            return this.applyContribution(spec, entity.Name, client, p, snapshot);
        }

        // Step 1: detect existing state via Get Active Form For Entity.
        const activeResult = await this.runActionByName(client, 'Get Active Form For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ], p);
        if (!activeResult.Success) {
            return this.fail(`Could not check for existing override: ${activeResult.Message ?? 'unknown error'}`);
        }
        const payload = this.parseActiveResult(activeResult.Message);
        const existingOverride = payload?.Active
            ?? payload?.Variants?.find(v => v.Status === 'Pending')
            ?? null;
        const hasExistingOverride = !!existingOverride?.OverrideID;

        // Step 2: confirm with the user. A form carrying the incumbent's own name is a
        // new version of it; any other form is a different form, and applying it swaps
        // which one the user sees rather than merging the two.
        const formName = (spec as unknown as { name?: string }).name ?? 'Custom Form';
        const isNewVersion = hasExistingOverride && !!existingOverride!.ComponentName
            && existingOverride!.ComponentName === formName;
        const proceed = await this.confirm(
            hasExistingOverride, isNewVersion, entityName, existingOverride?.ComponentVersion);
        if (!proceed) {
            return { Success: false, Kind: 'form', Message: 'Cancelled by user.' };
        }

        // Step 3: run Create or Modify.
        if (isNewVersion) {
            // For Pending overrides, use in-place modification (keep iterating on
            // the same version). For Active overrides, bump a new version so the
            // prior version is preserved.
            const isPending = existingOverride!.Status === 'Pending';
            const modifyResult = await this.runActionByName(client, 'Modify Interactive Form', [
                { Name: 'OverrideID', Value: existingOverride!.OverrideID!, Type: 'Input' },
                { Name: 'Spec', Value: JSON.stringify(spec), Type: 'Input' },
                { Name: 'Notes', Value: `Applied from chat artifact at ${new Date().toISOString()}`, Type: 'Input' },
                // A user "Apply" is a deliberate save, never an in-flight refinement —
                // so always snapshot a new restorable version rather than risk an
                // in-place overwrite. Passing an explicit bump makes this deterministic
                // across every source status (the 'in-place' default only applies to a
                // Pending source, which is the agent's iteration loop, not this path).
                // Exception: if the existing override is already Pending (no Active
                // version exists yet), use in-place to avoid creating unnecessary
                // version history.
                { Name: 'VersionBumpKind', Value: isPending ? 'in-place' : 'minor', Type: 'Input' },
            ], p);
            // Auto-activate the resulting version too. "Apply to my form" is an explicit
            // user action — they expect the applied form to go live, not sit as a Pending
            // draft the runtime variant switcher (Active variants only) can't reach. The
            // prior version is preserved as history and restorable from Form Builder.
            const modifyActivated = modifyResult.Success
                ? await this.activateCreatedOverride(client, modifyResult.Message, p)
                : false;
            return this.summarize(modifyResult, 'modify', user, modifyActivated);
        }
        const createResult = await this.runActionByName(client, 'Create Interactive Form', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
            { Name: 'Name',       Value: formName,   Type: 'Input' },
            { Name: 'Spec',       Value: JSON.stringify(spec), Type: 'Input' },
        ], p);
        // "Apply to my form" is an explicit, confirmed user action, so the freshly
        // created (Pending) override is activated immediately and the form goes live in
        // one step. Activation demotes whichever form was live to Inactive, which is
        // what makes the two swappable: both rows survive, one is live, and the form
        // picker switches between them.
        const activated = createResult.Success
            ? await this.activateCreatedOverride(client, createResult.Message, p)
            : false;
        return this.summarize(createResult, 'create', user, activated);
    }

    // ── form-panel contributions ─────────────────────────────────────────

    /**
     * Apply a `componentRole: 'form-panel'` spec as a `MJ: Entity Form Contributions`
     * row for the calling user.
     *
     * Two confirmations happen before anything is written, both driven by the live
     * composition snapshot when the caller supplies one for this entity:
     *
     *  - **A `replacesSectionKey` that names no section on the current form.** Left
     *    alone the panel would replace nothing and mount silently at its slot, which
     *    reads as a bug. The user is offered the extra-pane fallback, and declining
     *    cancels.
     *  - **An installed compiled contribution holding the same key.** Compiled wins
     *    ties by design, so replacing one is never implicit: on confirmation the new
     *    row takes `incumbent + 1`.
     */
    private async applyContribution(
        spec: ComponentSpec,
        entityName: string,
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        snapshot: FormCompositionSnapshot | null,
    ): Promise<InteractiveFormApplyResult> {
        const contribution = getDeclaredFormContribution(spec);
        if (!contribution) {
            return this.fail('This component declares componentRole form-panel but has no readable formContribution block.');
        }
        // A snapshot for a different entity tells us nothing about this form.
        const sameEntity = snapshot && snapshot.Entity === entityName ? snapshot : null;

        const context = await this.buildPlacementContext(client, provider, entityName, sameEntity);
        if (!context) {
            return this.fail(`Could not read the composition of the "${entityName}" form.`);
        }

        const decision = await this.askWherePanelGoes(context, contribution, spec.name, spec);
        if (!decision) return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };

        const placed = decision.Contribution;
        const key = this.writeKeyFor(placed);
        const precedence = await this.resolvePrecedence(key, sameEntity);
        if (precedence === null) {
            return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };
        }

        const existingResult = await this.runActionByName(client, 'Get Form Contributions For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ], provider);
        if (!existingResult.Success) {
            return this.fail(`Could not check existing contributions: ${existingResult.Message ?? 'unknown error'}`);
        }
        const existing = this.findExistingContribution(
            this.parseContributions(existingResult.Message), key, spec.name);

        const specToSend: ComponentSpec = ApplyDecisionToSpec(spec, decision);
        const { result, mode } = existing
            ? await this.modifyContribution(client, provider, specToSend, existing)
            : await this.createContribution(client, provider, specToSend, entityName, placed, precedence);

        if (!result.Success) {
            this.notifications.CreateSimpleNotification(
                `Add failed: ${result.Message ?? result.ResultCode ?? 'unknown error'}`, 'error', 5000);
            return { Success: false, Kind: 'contribution', Message: result.Message };
        }

        let payload: { ContributionID?: string; ComponentID?: string; Version?: string } = {};
        try { payload = JSON.parse(result.Message ?? '{}'); } catch { /* best effort */ }

        // A row is written Pending either way; activation is the user's choice, so a draft
        // is left alone rather than activated and then explained.
        const activated = decision.ActivateNow && !!payload.ContributionID
            ? await this.activateContribution(client, provider, payload.ContributionID!)
            : false;
        this.notifications.CreateSimpleNotification(
            activated
                ? `"${placed.title}" is now on your ${entityName} form at ${placed.slot}.`
                : `"${placed.title}" was saved as a draft. Turn it on from "Manage this form" on the ${entityName} form when you are ready.`,
            'success', 4000,
        );
        return {
            Success: true, Kind: 'contribution', Mode: mode,
            ContributionID: payload.ContributionID, ComponentID: payload.ComponentID,
            Version: payload.Version, Message: result.Message,
        };
    }

    /**
     * What the form contains, for the placement dialog to offer as targets.
     *
     * The live snapshot is preferred because it reports what the form actually rendered,
     * including compiled panels that exist only in this browser. It is absent whenever the
     * user is not on that record — the common case from a chat conversation — and the
     * server derivation stands in, from metadata alone.
     */
    private async buildPlacementContext(
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        entityName: string,
        snapshot: FormCompositionSnapshot | null,
    ): Promise<FormPlacementContext | null> {
        if (snapshot) {
            return {
                EntityName: entityName,
                Sections: snapshot.Sections.map(s => ({
                    Key: s.Key, Title: s.Title,
                    Fields: (s.Fields ?? []).map(f => ({ Name: f.Name, Label: f.Label })),
                })),
                Related: snapshot.Related.map(r => ({
                    Entity: r.Entity, JoinField: r.JoinField, DisplayName: r.Entity,
                })),
                Existing: snapshot.Contributions.map(c => ({
                    Key: c.Key, Slot: c.Slot, Title: c.Title, SortKey: c.SortKey,
                    InSectionKey: c.InSectionKey, SectionPosition: c.SectionPosition, FieldNames: c.FieldNames, SectionKeys: c.SectionKeys, ReplacesPlace: c.ReplacesPlace,
                })),
                SlotsPresent: [...snapshot.SlotsPresent],
                // The form reported these, so the dialog does not need to read one.
                SlotsVerified: true,
                Layout: snapshot.Layout === 'left-nav' ? 'left-nav' : 'accordion',
                // The rail the open form is actually showing.
                Rail: (snapshot.Rail ?? []).map(r => ({
                    Key: r.Key, Title: r.Title, Icon: r.Icon,
                    SectionKeys: r.SectionKeys, IsMore: r.IsMore,
                })),
                FullCustomForm: snapshot.SlotsPresent.length === 0,
                // The form reported these, so every key is one it really renders.
                TargetsVerified: true,
            };
        }

        const result = await this.runActionByName(client, 'Get Form Composition For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ], provider);
        if (!result.Success) {
            LogError(`InteractiveFormApplyService: composition lookup failed: ${result.Message ?? 'unknown error'}`);
            return null;
        }
        return this.parseComposition(result.Message, entityName);
    }

    /** The `Get Form Composition For Entity` payload, as the dialog's context. */
    private parseComposition(message: string | undefined, entityName: string): FormPlacementContext | null {
        try {
            const raw = JSON.parse(message ?? '{}') as {
                Sections?: Array<{ Key: string; Title: string; Fields?: Array<{ Name: string; Label: string }> }>;
                Related?: Array<{ Entity: string; JoinField: string }>;
                Contributions?: Array<{
                    Key: string; Slot: string; Title: string; SortKey?: number;
                    InSectionKey?: string; SectionPosition?: 'start' | 'end'; FieldNames?: string[]; SectionKeys?: string[]; ReplacesPlace?: boolean;
                }>;
                Layout?: string;
                SlotsPresent?: FormContributionSlot[];
                FullCustomForm?: boolean;
            };
            return {
                EntityName: entityName,
                Sections: (raw.Sections ?? []).map(s => ({
                    Key: s.Key, Title: s.Title,
                    Fields: (s.Fields ?? []).map(f => ({ Name: f.Name, Label: f.Label })),
                })),
                Related: (raw.Related ?? []).map(r => ({
                    Entity: r.Entity, JoinField: r.JoinField, DisplayName: r.Entity,
                })),
                Existing: (raw.Contributions ?? []).map(c => ({
                    Key: c.Key, Slot: c.Slot, Title: c.Title, SortKey: c.SortKey ?? 0,
                    InSectionKey: c.InSectionKey, SectionPosition: c.SectionPosition, FieldNames: c.FieldNames, SectionKeys: c.SectionKeys, ReplacesPlace: c.ReplacesPlace,
                })),
                SlotsPresent: raw.SlotsPresent ?? [],
                // The generated shape, not this form's. The dialog probes to replace it.
                SlotsVerified: false,
                Layout: raw.Layout === 'left-nav' ? 'left-nav' : 'accordion',
                // Entity metadata cannot say what the rail looks like — the probe resolves it.
                Rail: [],
                FullCustomForm: raw.FullCustomForm === true,
                // Derived from entity metadata. A generated form is frozen at the last CodeGen
                // run, so a section the metadata describes may not be one the form draws.
                TargetsVerified: false,
            };
        } catch {
            return null;
        }
    }

    /**
     * Opens the placement dialog and waits for the answers. Null means the user backed out.
     *
     * The proposal is passed in whole, but the dialog reads only what the component's author
     * can know from having built it — where the panel goes is decided here, not upstream.
     */
    private askWherePanelGoes(
        context: FormPlacementContext,
        proposal: FormContributionSpec,
        componentName: string | undefined,
        component: ComponentSpec,
    ): Promise<FormPlacementDecision | null> {
        return new Promise<FormPlacementDecision | null>((resolve) => {
            const ref = this.dialog.Open({
                content: MjFormPlacementDialogComponent,
                // Wide enough for the scaled form beside the settings column.
                width: 1320,
                minWidth: 720,
            });
            const dialog = ref.Content?.instance as unknown as MjFormPlacementDialogComponent | undefined;
            if (!dialog) {
                ref.Close();
                resolve(null);
                return;
            }
            dialog.ComponentName = componentName ?? proposal.title;
            dialog.Proposal = proposal;
            // The preview draws the component itself, not a placeholder, before anything is saved.
            dialog.PanelComponentSpec = component;
            dialog.Context = context;

            let settled = false;
            const finish = (decision: FormPlacementDecision | null): void => {
                if (settled) return;
                settled = true;
                ref.Close();
                resolve(decision);
            };
            dialog.Applied.subscribe((decision: FormPlacementDecision) => finish(decision));
            dialog.Cancelled.subscribe(() => finish(null));
            // The backdrop and the title-bar close both resolve the ref without reaching
            // either output, so treat that as a cancel rather than hanging the caller.
            ref.Result.subscribe(() => { if (!settled) { settled = true; resolve(null); } });
        });
    }

    /**
     * Precedence for a new row: 0 normally, or one above an installed compiled
     * contribution the user has agreed to replace. Null means the user cancelled.
     */
    private async resolvePrecedence(
        key: string | null,
        snapshot: FormCompositionSnapshot | null,
    ): Promise<number | null> {
        const incumbent = key
            ? snapshot?.Contributions.find(c => c.Key === key && c.Source === 'class')
            : undefined;
        if (!incumbent) return 0;
        const replace = await this.ask(
            'Replace an installed contribution?',
            `An installed app already provides "${incumbent.Title}" on this form. Replace it with this panel for your user?`,
            'Replace',
        );
        return replace ? incumbent.Precedence + 1 : null;
    }

    /**
     * The key the row will carry. Must stay byte-identical to the write path's
     * `ResolveWriteContributionKey` and the renderer's `RelatedContributionKey`, or the
     * duplicate lookup and the incumbent lookup both miss.
     */
    private writeKeyFor(contribution: FormContributionSpec): string | null {
        if (contribution.contributionKey) return contribution.contributionKey;
        if (!contribution.relatedEntity) return null;
        const join = (contribution.relatedJoinField ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
        return `related:${contribution.relatedEntity.trim()}:${join}`;
    }

    private async createContribution(
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        spec: ComponentSpec,
        entityName: string,
        contribution: FormContributionSpec,
        precedence: number,
    ): Promise<{ result: { Success: boolean; Message?: string; ResultCode?: string }; mode: InteractiveFormApplyResult['Mode'] }> {
        const result = await this.runActionByName(client, 'Create Form Contribution', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
            { Name: 'Name', Value: contribution.title, Type: 'Input' },
            { Name: 'Spec', Value: JSON.stringify(spec), Type: 'Input' },
            { Name: 'Precedence', Value: String(precedence), Type: 'Input' },
        ], provider);
        return { result, mode: 'create' };
    }

    private async modifyContribution(
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        spec: ComponentSpec,
        existing: ParsedContribution,
    ): Promise<{ result: { Success: boolean; Message?: string; ResultCode?: string }; mode: InteractiveFormApplyResult['Mode'] }> {
        // Modify operates on a Component lineage keyed by Name, same as the whole-form path.
        if (existing.ComponentName) this.alignSpecToLineage(spec, existing.ComponentName);
        const isPending = existing.Status === 'Pending';
        const result = await this.runActionByName(client, 'Modify Form Contribution', [
            { Name: 'ContributionID', Value: existing.ContributionID, Type: 'Input' },
            { Name: 'Spec', Value: JSON.stringify(spec), Type: 'Input' },
            { Name: 'Notes', Value: `Applied from chat artifact at ${new Date().toISOString()}`, Type: 'Input' },
            { Name: 'VersionBumpKind', Value: isPending ? 'in-place' : 'minor', Type: 'Input' },
        ], provider);
        return { result, mode: isPending ? 'modify-in-place' : 'modify-new-version' };
    }

    /**
     * Best-effort activation. On failure the row stays a Pending draft the user can
     * activate from "Manage this form", so we log rather than failing the whole apply.
     */
    private async activateContribution(
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        contributionID: string,
    ): Promise<boolean> {
        const act = await this.runActionByName(client, 'Activate Form Contribution Version', [
            { Name: 'ContributionID', Value: contributionID, Type: 'Input' },
        ], provider);
        if (!act.Success) {
            LogError(`InteractiveFormApplyService: contribution ${contributionID} created but activation failed: ${act.Message ?? 'unknown error'}`);
        }
        return act.Success;
    }

    /**
     * The caller's own live row for this panel, or undefined when there is none.
     *
     * `contributionKey` is the declared identity and is matched first. A spec that
     * declares none still has one — the component name — and matching on it is what
     * stops a second apply of the same panel installing a second copy beside the
     * first. Without that fallback an identity-less panel is unrecognizable to its
     * own next apply, and the form grows a duplicate on every press.
     */
    private findExistingContribution(
        rows: ParsedContribution[],
        key: string | null,
        componentName: string | undefined,
    ): ParsedContribution | undefined {
        const mine = rows.filter(c =>
            c.Scope === 'User' && (c.Status === 'Active' || c.Status === 'Pending'));

        if (key) {
            return mine.find(c => c.ContributionKey === key);
        }

        const name = componentName?.trim();
        if (!name) return undefined;
        return mine.find(c => !c.ContributionKey && c.ComponentName?.trim() === name);
    }

    private parseContributions(message: string | undefined): ParsedContribution[] {
        if (!message) return [];
        try {
            return (JSON.parse(message) as { Contributions?: ParsedContribution[] }).Contributions ?? [];
        } catch {
            return [];
        }
    }

    // ── internals ────────────────────────────────────────────────────────

    /**
     * Look up an action by name and run it. The actions module ships with
     * `__CreateInteractiveForm` / `__ModifyInteractiveForm` / etc. as their
     * DriverClass names but registers under the human-readable form name.
     * GraphQLActionClient.RunAction() takes the action ID; we fetch it by
     * name from the action metadata loaded on the provider.
     */
    private async runActionByName(
        client: GraphQLActionClient,
        actionName: string,
        params: Array<{ Name: string; Value: string; Type: 'Input' }>,
        provider: IMetadataProvider,
    ): Promise<{ Success: boolean; Message?: string; ResultCode?: string }> {
        try {
            // The action ID is required by RunAction. We look it up from the
            // action engine's cached metadata if available; otherwise we ask
            // the GraphQL provider directly.
            const actionId = await this.resolveActionIdByName(actionName, provider);
            if (!actionId) {
                return { Success: false, Message: `Action '${actionName}' not found.` };
            }
            const result = await client.RunAction(actionId, params);
            // ActionResult.Result is the MJActionResultCodeEntity carrying
            // the string ResultCode; surface it on the failure path for
            // diagnostic messaging. ActionResult itself doesn't expose
            // ResultCode directly.
            const resultCode = (result as { Result?: { ResultCode?: string } })?.Result?.ResultCode;
            return {
                Success: !!result.Success,
                Message: result.Message ?? undefined,
                ResultCode: resultCode ?? undefined,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`InteractiveFormApplyService.runActionByName(${actionName}): ${message}`);
            return { Success: false, Message: message };
        }
    }

    /**
     * Resolve an action ID by Name. Falls back to a direct RunView against
     * the Action entity when ActionEngine isn't loaded.
     */
    private async resolveActionIdByName(name: string, provider: IMetadataProvider): Promise<string | null> {
        try {
            // ActionEngine may not be initialised in the chat surface — query directly.
            // The core Action table is registered as the "MJ: Actions" entity.
            const rv = RunView.FromMetadataProvider(provider);
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Actions',
                ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            });
            return result.Success ? (result.Results?.[0]?.ID ?? null) : null;
        } catch (err) {
            LogError(`InteractiveFormApplyService.resolveActionIdByName(${name}): ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Activate the override produced by a successful Create so a net-new form goes
     * live immediately. Best-effort: on failure the form stays a Pending draft the
     * user can activate manually, so we log and return false rather than failing the
     * whole apply.
     */
    private async activateCreatedOverride(
        client: GraphQLActionClient,
        createMessage: string | undefined,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        let overrideId: string | undefined;
        try {
            overrideId = (JSON.parse(createMessage ?? '{}') as { OverrideID?: string }).OverrideID;
        } catch {
            overrideId = undefined;
        }
        if (!overrideId) return false;
        const activateResult = await this.runActionByName(client, 'Activate Interactive Form Version', [
            { Name: 'OverrideID', Value: overrideId, Type: 'Input' },
        ], provider);
        if (!activateResult.Success) {
            LogError(`InteractiveFormApplyService: created override ${overrideId} but auto-activation failed: ${activateResult.Message ?? 'unknown error'}`);
        }
        return activateResult.Success;
    }

    /**
     * Align a freshly generated spec to an existing Component lineage before Modify.
     * MJ identifies a form lineage by Component Name and refuses to change it between
     * versions, so we rename the incoming spec — both `spec.name` and the root
     * `function` declaration in `spec.code` (the linter requires them to match) — to
     * the existing lineage name.
     */
    private alignSpecToLineage(spec: ComponentSpec, existingName: string): void {
        const s = spec as { name?: string; code?: string };
        const currentName = s.name;
        if (!currentName || currentName === existingName) return;
        s.name = existingName;
        if (typeof s.code === 'string' && s.code.length > 0) {
            const escaped = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            s.code = s.code.replace(new RegExp(`function\\s+${escaped}\\s*\\(`), `function ${existingName}(`);
        }
    }

    /** Show a confirmation dialog explaining what's about to happen. */
    private async confirm(
        hasExistingActive: boolean,
        isNewVersion: boolean,
        entityName: string,
        currentVersion: string | null | undefined,
    ): Promise<boolean> {
        // The dialog renders string content as plain text (not innerHTML), so use
        // plain text here — HTML tags would show raw.
        let content: string;
        if (isNewVersion) {
            content = `This is a new version of the custom form you already use for "${entityName}" (v${currentVersion ?? '?'}). Applying it makes the new version your active form; the previous version is preserved and can be restored.`;
        } else if (hasExistingActive) {
            content = `You already have a custom form for "${entityName}". This is a different form, so applying it makes this one live and puts the other aside — nothing is merged. Switch between them from the form picker in the toolbar.`;
        } else {
            content = `This will create a custom form for "${entityName}" scoped to your user and make it active. Other users will continue to see the default form.`;
        }
        // MJDialogAction surface is {text, primary?, themeColor?}; the
        // dialog's Result observable emits the entire clicked action (or
        // undefined for backdrop/X dismissal). Detect intent via the
        // `primary` flag — Apply / Create Pending are the primary actions;
        // Cancel and dismissal both resolve false.
        return this.ask('Apply this form?', content, 'Apply');
    }

    /** Two-button confirm; resolves true when the user picks the primary action. */
    private async ask(title: string, content: string, primaryText: string): Promise<boolean> {
        const ref = this.dialog.Open({
            title,
            content,
            width: 540,
            actions: [
                { text: primaryText, primary: true, themeColor: 'primary' },
                { text: 'Cancel' },
            ],
        });
        return new Promise<boolean>(resolve => {
            ref.Result.subscribe((res: unknown) => {
                resolve((res as { primary?: boolean })?.primary === true);
            });
        });
    }

    private parseActiveResult(message: string | undefined): {
        Active?: { OverrideID?: string; ComponentVersion?: string; ComponentName?: string; Status?: string };
        Variants?: Array<{ OverrideID?: string; ComponentVersion?: string; ComponentName?: string; Status?: string }>;
    } | null {
        if (!message) return null;
        try {
            return JSON.parse(message) as {
                Active?: { OverrideID?: string; ComponentVersion?: string; ComponentName?: string; Status?: string };
                Variants?: Array<{ OverrideID?: string; ComponentVersion?: string; ComponentName?: string; Status?: string }>;
            };
        } catch {
            return null;
        }
    }

    private summarize(
        result: { Success: boolean; Message?: string; ResultCode?: string },
        kind: 'create' | 'modify',
        _user: UserInfo,
        activated: boolean = false,
    ): InteractiveFormApplyResult {
        if (!result.Success) {
            this.notifications.CreateSimpleNotification(
                `Apply failed: ${result.Message ?? result.ResultCode ?? 'unknown error'}`,
                'error', 5000,
            );
            return { Success: false, Kind: 'form', Message: result.Message };
        }
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(result.Message ?? '{}'); } catch { /* best effort */ }
        const mode: InteractiveFormApplyResult['Mode'] = kind === 'create'
            ? 'create'
            : (payload.Mode === 'in-place' ? 'modify-in-place' : 'modify-new-version');
        const note = kind === 'create'
            ? (activated
                ? 'Custom form is now active for your user.'
                : 'Custom form created as a Pending draft — activate it from Form Builder to go live.')
            : (activated
                ? `Updated form is now active${payload.Version ? ` (v${payload.Version})` : ''} for your user.`
                : (mode === 'modify-in-place'
                    ? 'Pending version updated. Activate it from Form Builder when ready.'
                    : `Pending v${payload.Version ?? '?'} created. Activate it from Form Builder when ready.`));
        this.notifications.CreateSimpleNotification(note, 'success', 4000);
        return {
            Success: true,
            Kind: 'form',
            Mode: mode,
            OverrideID: payload.OverrideID as string | undefined,
            ComponentID: payload.ComponentID as string | undefined,
            Version: payload.Version as string | undefined,
            Message: result.Message,
        };
    }

    private fail(message: string): InteractiveFormApplyResult {
        this.notifications.CreateSimpleNotification(`Apply failed: ${message}`, 'error', 5000);
        return { Success: false, Message: message };
    }
}
