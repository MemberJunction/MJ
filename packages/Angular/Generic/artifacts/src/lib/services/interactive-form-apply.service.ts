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
import {
    CompositeKey, Metadata, LogError, RunView,
    type EntityInfo, type IMetadataProvider, type UserInfo,
} from '@memberjunction/core';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    GetDeclaredFormContribution, IsFormPanelRole, IsPanelContributionKey, ResolveContributionWriteKey,
    type FormContributionSlot, type FormContributionSpec,
} from '@memberjunction/interactive-component-types/forms';
import {
    ApplyDecisionToSpec, CollectFormContributionRegistrations,
    FieldGroupsInDetails, FormCompositionRegistry, FormSlotProbeService, HumanizeEntityTitle, MjFormPlacementDialogComponent,
    PlacementStateFromContribution, ResolveContributionKey, ResolveFormContributionWinners,
    type FormCompositionSnapshot, type FormPlacementContext, type FormPlacementDecision, type FormRecordRef,
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
    Precedence?: number;
    Name?: string;
    ComponentName?: string | null;
}

/** The subset of a `Get Active Form For Entity` override this service reads. */
interface ParsedOverride {
    OverrideID?: string;
    ComponentVersion?: string;
    ComponentName?: string;
    Status?: string;
    Scope?: string;
}

@Injectable({ providedIn: 'root' })
export class InteractiveFormApplyService {
    private readonly dialog = inject(MJDialogService);
    private readonly notifications = inject(MJNotificationService);
    private readonly probe = inject(FormSlotProbeService);
    private readonly compositions = inject(FormCompositionRegistry);

    /**
     * Confirm with the user and apply the spec. Routes to Create / Modify
     * automatically based on whether an Active override already exists.
     *
     * @param form The form the user has open, as the agent context names it
     *   (`AdditionalContext.Form`). Its full composition snapshot is read from the
     *   {@link FormCompositionRegistry}; with no reference, or no such form open, a panel's
     *   placement is worked out from the server's composition instead.
     */
    public async ConfirmAndApply(
        spec: ComponentSpec,
        entityName: string,
        provider?: IMetadataProvider,
        form: FormRecordRef | null = null,
    ): Promise<InteractiveFormApplyResult> {
        const snapshot = this.compositions.Find(form);
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
        if (IsFormPanelRole(spec)) {
            return this.applyContribution(spec, entity, client, p, snapshot);
        }

        // Step 1: detect existing state via Get Active Form For Entity.
        const activeResult = await this.runActionByName(client, 'Get Active Form For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ], p);
        if (!activeResult.Success) {
            return this.fail(`Could not check for existing override: ${activeResult.Message ?? 'unknown error'}`);
        }
        const payload = this.parseActiveResult(activeResult.Message);
        // Only the user's own form can be modified. A form shared with them is left as it is,
        // and applying creates their own, which outranks it for them alone.
        const existingOverride = this.ownOverride(payload);
        const sharedOverride = existingOverride ? null : this.sharedOverride(payload);
        const hasExistingOverride = !!existingOverride?.OverrideID;

        // Step 2: confirm with the user. A form carrying the incumbent's own name is a
        // new version of it; any other form is a different form, and applying it swaps
        // which one the user sees rather than merging the two.
        const formName = (spec as unknown as { name?: string }).name ?? 'Custom Form';
        const isNewVersion = hasExistingOverride && !!existingOverride!.ComponentName
            && existingOverride!.ComponentName === formName;
        const proceed = await this.confirm(
            hasExistingOverride, isNewVersion, entityName, existingOverride?.ComponentVersion, !!sharedOverride);
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
            if (modifyResult.Success) this.probe.Forget(entityName);
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
        if (createResult.Success) this.probe.Forget(entityName);
        return this.summarize(createResult, 'create', user, activated);
    }

    /**
     * The user's own form for the entity: their live one, else their draft. Null when they have
     * none, whatever is shared with them. A form that names no scope is taken as their own.
     */
    private ownOverride(payload: ReturnType<InteractiveFormApplyService['parseActiveResult']>): ParsedOverride | null {
        const own = (form: ParsedOverride): boolean => !!form.OverrideID && (form.Scope ?? 'User') === 'User';
        if (payload?.Active && own(payload.Active)) return payload.Active;
        return payload?.Variants?.find(v => v.Status === 'Pending' && own(v)) ?? null;
    }

    /** The live form shared with the user — a Role or Global one they cannot change. */
    private sharedOverride(payload: ReturnType<InteractiveFormApplyService['parseActiveResult']>): ParsedOverride | null {
        const active = payload?.Active;
        return active?.OverrideID && (active.Scope ?? 'User') !== 'User' ? active : null;
    }

    // ── form-panel contributions ─────────────────────────────────────────

    /**
     * Apply a `componentRole: 'form-panel'` spec as a `MJ: Entity Form Contributions`
     * row for the calling user.
     *
     * Two confirmations happen before anything is written, both driven by the live
     * composition snapshot when the open form for this entity has one in the registry:
     *
     *  - **A `replacesSectionKey` that names no section on the current form.** Left
     *    alone the panel would replace nothing and mount silently at its slot, which
     *    reads as a bug. The user is offered the extra-pane fallback, and declining
     *    cancels.
     *  - **An installed compiled contribution holding the same key.** Compiled wins
     *    ties by design, so replacing one is never implicit: on confirmation the new
     *    row takes `incumbent + 1`.
     *
     * Only the user's own row is modified. When the live row for the key is shared with
     * them (Role or Global), a row of their own is created above it instead, which
     * outranks it for them alone.
     */
    private async applyContribution(
        spec: ComponentSpec,
        entity: EntityInfo,
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        snapshot: FormCompositionSnapshot | null,
    ): Promise<InteractiveFormApplyResult> {
        const entityName = entity.Name;
        const contribution = GetDeclaredFormContribution(spec);
        if (!contribution) {
            return this.fail('This component declares componentRole form-panel but has no readable formContribution block.');
        }
        // A snapshot for a different entity tells us nothing about this form.
        const sameEntity = snapshot && snapshot.Entity === entityName ? snapshot : null;

        const context = await this.buildPlacementContext(client, provider, entityName, sameEntity);
        if (!context) {
            return this.fail(`Could not read the composition of the "${entityName}" form.`);
        }

        const decision = await this.askWherePanelGoes(
            context, contribution, spec.name, spec, provider, this.recordKeyFrom(sameEntity, entity));
        if (!decision) return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };

        const placed = decision.Contribution;
        // The key the write path will derive, so the duplicate and incumbent lookups find it.
        const key = ResolveContributionWriteKey(placed, this.relatedEntityName(placed, provider), spec.name);
        const precedence = await this.resolvePrecedence(key, sameEntity, entity, provider);
        if (precedence === null) {
            return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };
        }

        const existingResult = await this.runActionByName(client, 'Get Form Contributions For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ], provider);
        if (!existingResult.Success) {
            return this.fail(`Could not check existing contributions: ${existingResult.Message ?? 'unknown error'}`);
        }
        const rows = this.parseContributions(existingResult.Message);
        const existing = this.findExistingContribution(rows, key, placed, spec.name);
        const shared = this.sharedIncumbent(rows, key);
        const needed = shared ? Math.max(precedence, (shared.Precedence ?? 0) + 1) : precedence;

        const specToSend: ComponentSpec = ApplyDecisionToSpec(spec, decision);
        const { result, mode } = existing
            ? await this.modifyContribution(client, provider, specToSend, existing, needed)
            : await this.createContribution(client, provider, specToSend, entityName, placed, needed);

        if (!result.Success) {
            this.notifications.CreateSimpleNotification(
                `Add failed: ${result.Message ?? result.ResultCode ?? 'unknown error'}`, 'error', 5000);
            return { Success: false, Kind: 'contribution', Message: result.Message };
        }

        this.probe.Forget(entityName);
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
                Sections: this.fieldGroupsOf(snapshot).map(s => ({
                    Key: s.Key, Title: s.Title,
                    Fields: (s.Fields ?? []).map(f => ({ Name: f.Name, Label: f.Label })),
                })),
                // Titled as the grid's rail item is, so the dialog can find the item it sits under.
                Related: snapshot.Related.map(r => ({
                    Entity: r.Entity, JoinField: r.JoinField,
                    DisplayName: HumanizeEntityTitle(snapshot.Sections.find(s => s.Key === r.SectionKey)?.Title || r.Entity),
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
                FullCustomForm: snapshot.FormChoice.FullCustomForm,
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

    /**
     * The field groups a panel can stand in for: what the Details rail item holds, the same set
     * the dialog's own probe offers. Related grids, installed panels and system metadata are not.
     */
    private fieldGroupsOf(snapshot: FormCompositionSnapshot): FormCompositionSnapshot['Sections'] {
        const keys = new Set(FieldGroupsInDetails(
            snapshot.Sections.map(s => ({ SectionKey: s.Key, SectionName: s.Title, Variant: s.Variant })),
            snapshot.Rail ?? [],
        ).map(group => group.Key));
        return snapshot.Sections.filter(s => keys.has(s.Key));
    }

    /**
     * The open record's key, read from the snapshot's URL segment. Null when the snapshot names
     * no record (a record not saved yet), or names fields that are not the entity's primary key.
     */
    private recordKeyFrom(snapshot: FormCompositionSnapshot | null, entity: EntityInfo): CompositeKey | null {
        const raw = snapshot?.RecordPrimaryKey?.trim();
        if (!raw) return null;
        const key = CompositeKey.FromURLSegment(entity, raw);
        const keyFields = entity.PrimaryKeys.map(pk => pk.Name);
        const pairs = key.KeyValuePairs ?? [];
        const valid = pairs.length === keyFields.length && pairs.every(pair => keyFields.includes(pair.FieldName));
        return valid ? key : null;
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
                    Entity: r.Entity, JoinField: r.JoinField, DisplayName: HumanizeEntityTitle(r.Entity),
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
     * The proposal is passed in whole. The dialog reads its identity directly and starts from
     * the claims the open form can honour; the user confirms where the panel goes.
     */
    private askWherePanelGoes(
        context: FormPlacementContext,
        proposal: FormContributionSpec,
        componentName: string | undefined,
        component: ComponentSpec,
        provider: IMetadataProvider,
        recordKey: CompositeKey | null,
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
            dialog.Provider = provider;
            dialog.ComponentName = componentName ?? proposal.title;
            dialog.Proposal = proposal;
            // The dialog starts from the proposal's claims the open form can honour. The
            // proposal's own key and sort order are left out: a key that matches an installed
            // panel would read as "replace that panel", which the author cannot have meant, and
            // the order among the panels in one position is the host's.
            dialog.SeedState = (d) => {
                d.State = PlacementStateFromContribution(
                    { ...proposal, contributionKey: undefined, sortKey: undefined },
                    d.Context,
                    !d.Context.FullCustomForm,
                );
            };
            // The preview draws the component itself, not a placeholder, before anything is saved.
            dialog.PanelComponentSpec = component;
            dialog.RecordKey = recordKey;
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
        entity: EntityInfo,
        provider: IMetadataProvider,
    ): Promise<number | null> {
        // Without the open form, the incumbent is found among the registrations, whose rows the
        // engine holds, so it has to have loaded them.
        if (key && !snapshot) await InteractiveFormsEngine.Instance.Config(false, provider.CurrentUser, provider);
        const incumbent = key ? this.compiledIncumbent(key, snapshot, entity, provider) : null;
        if (!incumbent) return 0;
        const replace = await this.ask(
            'Replace an installed contribution?',
            `An installed app already provides "${incumbent.Title}" on this form. Replace it with this panel for your user?`,
            'Replace',
        );
        return replace ? incumbent.Precedence + 1 : null;
    }

    /**
     * The installed compiled contribution holding this key, if any: the registration that wins
     * the key, when it is a compiled one. Read from the open form when there is one, else from
     * the entity's registrations collapsed the way the form collapses them. Panels this user has
     * hidden are included, since they still hold their key.
     */
    private compiledIncumbent(
        key: string,
        snapshot: FormCompositionSnapshot | null,
        entity: EntityInfo,
        provider: IMetadataProvider,
    ): { Title: string; Precedence: number } | null {
        if (snapshot) return snapshot.Contributions.find(c => c.Key === key && c.Source === 'class') ?? null;
        const registrations = CollectFormContributionRegistrations(entity, provider, { IncludeHidden: true });
        const winner = ResolveFormContributionWinners(entity.Name, registrations).Winners
            .find(reg => ResolveContributionKey(reg.Metadata) === key);
        if (!winner || (winner.Source ?? 'class') !== 'class') return null;
        return { Title: winner.Title ?? key, Precedence: winner.Priority };
    }

    /** The registered name of the entity a grid claim names, which the write path derives the key from. */
    private relatedEntityName(contribution: FormContributionSpec, provider: IMetadataProvider): string | null {
        const name = contribution.relatedEntity?.trim();
        if (!name) return null;
        return provider.EntityByName(name)?.Name ?? name;
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

    /**
     * Modifies the user's own row. `precedence` is written only when it is above the row's own,
     * so the row outranks the incumbent the user agreed to replace or a shared row above it.
     */
    private async modifyContribution(
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        spec: ComponentSpec,
        existing: ParsedContribution,
        precedence: number,
    ): Promise<{ result: { Success: boolean; Message?: string; ResultCode?: string }; mode: InteractiveFormApplyResult['Mode'] }> {
        // Modify operates on a Component lineage keyed by Name, same as the whole-form path.
        if (existing.ComponentName) this.alignSpecToLineage(spec, existing.ComponentName);
        const isPending = existing.Status === 'Pending';
        const params: Array<{ Name: string; Value: string; Type: 'Input' }> = [
            { Name: 'ContributionID', Value: existing.ContributionID, Type: 'Input' },
            { Name: 'Spec', Value: JSON.stringify(spec), Type: 'Input' },
            { Name: 'Notes', Value: `Applied from chat artifact at ${new Date().toISOString()}`, Type: 'Input' },
            { Name: 'VersionBumpKind', Value: isPending ? 'in-place' : 'minor', Type: 'Input' },
        ];
        if (precedence > (existing.Precedence ?? 0)) {
            params.push({ Name: 'Precedence', Value: String(precedence), Type: 'Input' });
        }
        const result = await this.runActionByName(client, 'Modify Form Contribution', params, provider);
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
     * Matched by the key the write path derives, which for a panel that claims no other
     * panel and no grid is `panel:<component name>`. Keys are compared trimmed and ignoring
     * case, as Create's duplicate check and the unique index compare them on SQL Server. Such a
     * panel is also matched by its component name on a row that carries a panel key, because
     * Modify keeps a panel's key when it renames the component.
     */
    private findExistingContribution(
        rows: ParsedContribution[],
        key: string | null,
        placed: FormContributionSpec,
        componentName: string | undefined,
    ): ParsedContribution | undefined {
        if (!key) return undefined;
        const mine = rows.filter(c =>
            c.Scope === 'User' && (c.Status === 'Active' || c.Status === 'Pending'));
        const wanted = key.trim().toLowerCase();
        const byKey = mine.find(c => (c.ContributionKey ?? '').trim().toLowerCase() === wanted);
        const keyless = !placed.contributionKey?.trim() && !placed.relatedEntity?.trim();
        const name = componentName?.trim();
        if (byKey || !keyless || !name) return byKey;
        return mine.find(c => IsPanelContributionKey(c.ContributionKey) && c.ComponentName?.trim() === name);
    }

    /**
     * The live row shared with the user (Role or Global) that holds this key, the highest ranked
     * when there are several. The user cannot change it, so their own row is written above it.
     */
    private sharedIncumbent(rows: ParsedContribution[], key: string | null): ParsedContribution | undefined {
        if (!key) return undefined;
        return rows
            .filter(c => c.Scope !== 'User' && c.Status === 'Active' && c.ContributionKey === key)
            .sort((a, b) => (b.Precedence ?? 0) - (a.Precedence ?? 0))[0];
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
        sharedWithUser = false,
    ): Promise<boolean> {
        // The dialog renders string content as plain text (not innerHTML), so use
        // plain text here — HTML tags would show raw.
        let content: string;
        if (sharedWithUser && !hasExistingActive) {
            content = `"${entityName}" shows a custom form shared with you. Applying this creates your own form and makes it live for you only; everyone else keeps the shared form.`;
        } else if (isNewVersion) {
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

    private parseActiveResult(message: string | undefined): { Active?: ParsedOverride | null; Variants?: ParsedOverride[] } | null {
        if (!message) return null;
        try {
            return JSON.parse(message) as { Active?: ParsedOverride | null; Variants?: ParsedOverride[] };
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
