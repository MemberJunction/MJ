import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    inject,
} from '@angular/core';
import { BaseEntity, BaseEntityEvent, CompositeKey, LogError, Metadata, RunView } from '@memberjunction/core';
import { MJGlobal, MJEventType, MJEvent } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ResourceData, MJEnvironmentEntityExtended, UserInfoEngine } from '@memberjunction/core-entities';
import type { MJComponentEntity, MJEntityFormOverrideEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import type { NavigationRequest } from '@memberjunction/ng-conversations';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Subscription } from 'rxjs';
import {
    buildCuratedFormSchema,
    buildDefaultFormScaffold,
    type CuratedFormSchema,
} from '@memberjunction/interactive-component-types/forms';
import { generateCodeFromCanvas, toComponentIdentifier } from '../ComponentStudio/services/canvas-to-code';
import { parseCanvasFromCode } from '../ComponentStudio/services/code-to-canvas';
import {
    buildEmptyCanvas,
    generateCanvasId,
    type FormCanvasElement,
    type FormCanvasModel,
    type FormCanvasSection,
} from '../ComponentStudio/services/form-canvas-model';
import { EntityFormOverrideService } from '../ComponentStudio/services/entity-form-override.service';
import { ConversationBridgeService } from '@memberjunction/ng-conversations';
import { joinVersionsWithOverrides, pickActiveVersionID } from './form-builder-version-rail.helpers';
import type { FormOverrideDialogResult } from '../ComponentStudio/components/form-override-dialog.component';

/**
 * UserInfoEngine setting key for the Form Builder cockpit's persisted UI
 * preferences. Single key holds a JSON-serialized {@link FormBuilderPrefs}.
 * Namespaced under `mj.formBuilder.*` so admin-tier setting browsers can
 * filter for app-specific prefs at a glance.
 */
const FORM_BUILDER_PREFS_KEY = 'mj.formBuilder.cockpitPrefs.v1';

/**
 * Persisted shape for the cockpit's resizable-pane sizes + collapse state.
 * Versioned via the storage key (`v1`) so future schema changes can read +
 * migrate older JSON without breaking on shape drift.
 */
export interface FormBuilderPrefs {
    /** Percent (0-100) widths of the three top-level shell panes. */
    leftPanePct?: number;
    centerPanePct?: number;
    chatPanePct?: number;
    /** Collapse flags persist across reloads. */
    leftCollapsed?: boolean;
    chatCollapsed?: boolean;
    /** Last center-pane tab used (Preview / Code / Layout). */
    lastCenterPaneMode?: 'preview' | 'code' | 'layout';
}

/**
 * One Component version in the active form's Name lineage. The version rail
 * lists these; clicking activates / previews / diffs.
 */
export interface ComponentVersionRow {
    ID: string;
    Name: string;
    Version: string;
    VersionSequence: number;
    Status: string;
    UpdatedAt: Date | null;
    /** True when this version is the one currently pointed at by an Active
     *  override for the calling user. */
    IsActive: boolean;
    /** True when this version is pointed at by a Pending override for the
     *  user (i.e. an AI-authored refinement awaiting activation). */
    IsPending: boolean;
}

/**
 * Lightweight summary of a form-role Component, populated from MJ: Components
 * for the left-rail picker. Specification is loaded on demand when the user
 * actually opens a form so we don't pay the JSON parse cost N times.
 */
interface FormComponentSummary {
    ID: string;
    Name: string;
    Namespace: string | null;
    /**
     * `Component.Status` (Draft / Published / Deprecated) — kept on the
     * summary for callers that need it (e.g. the version rail), but NOT
     * what the left rail badge displays. The left rail surfaces the
     * **override** status (see `OverrideStatus` below) because that's
     * what drives runtime visibility for the user.
     */
    Status: string | null;
    /**
     * The current user's `EntityFormOverride.Status` (Active / Inactive /
     * Pending) for this Component, when an override exists. Null when no
     * user-scope override binds to this Component — in which case the
     * runtime falls through to a higher-scope (Role/Global) override or
     * the CodeGen Angular default. Populated by `loadExistingForms` via
     * a single batch lookup against `MJ: Entity Form Overrides`.
     */
    OverrideStatus: 'Active' | 'Inactive' | 'Pending' | null;
    Description: string | null;
    TargetEntityName: string | null;
}

/**
 * Form Builder resource — the standalone Form Studio canvas reachable from
 * the top-left Application rail. Provides a drag-drop canvas, field-binding
 * inspector, and EntityFormOverride activation flow that mirrors Component
 * Studio's contextual Form Builder tab but as its own dedicated workspace.
 *
 * Owns its OWN state — does NOT depend on `ComponentStudioStateService`,
 * which is provided per-Component-Studio-dashboard. The canvas and right
 * panel children are state-agnostic and accept everything via @Input/@Output.
 *
 * Per `dashboards/CLAUDE.md`, this resource MUST call `NotifyLoadComplete()`
 * after the initial load — without it, the shell loading screen hangs forever
 * on direct URL navigation (e.g. `/app/form-studio/Form%20Builder`).
 */
@RegisterClass(BaseResourceComponent, 'FormBuilderResource')
@Component({
    standalone: false,
    selector: 'mj-form-builder-resource',
    templateUrl: './form-builder-resource.component.html',
    styleUrls: ['./form-builder-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormBuilderResourceComponent
    extends BaseResourceComponent
    implements AfterViewInit, OnDestroy {

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Form Builder';
    }

    public async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-pen-ruler';
    }

    public LeftRailCollapsed = false;
    public RightRailCollapsed = false;
    public ChatPaneCollapsed = false;
    public IsLoading = true;
    public ExistingForms: FormComponentSummary[] = [];
    public LeftRailFilter = '';

    /**
     * Center-pane view mode for the cockpit. Default is 'preview' because the
     * preview is the most useful single view when a form is loaded; users
     * tab to 'code' to edit and 'layout' for the (legacy) drag-drop canvas.
     */
    public CenterPaneMode: 'preview' | 'code' | 'layout' = 'preview';

    /**
     * Version rail data. Lineage = all Component rows sharing the active
     * form's Name. Ordered by VersionSequence DESC so the newest is on top.
     */
    public Versions: ComponentVersionRow[] = [];
    public VersionsLoading = false;
    public ActiveVersionID: string | null = null;

    /**
     * Live preview state. When the user switches to the Preview tab, we load
     * a Top-1 record from `TargetEntityName` and mount `<mj-interactive-form>`
     * with the working `componentSpec` derived from the current EditableCode.
     * Failure modes (no record, RunView error) fall back to a synthetic
     * NewRecord() so the form still mounts — the user just sees an empty
     * draft instead of a broken pane.
     */
    public PreviewRecord: BaseEntity | null = null;
    public PreviewRecordIsReal = false;
    public PreviewRecordLabel = '';
    public PreviewLoading = false;
    public PreviewError: string | null = null;
    public PreviewPickerOpen = false;

    /**
     * The saved ComponentSpec from the last loaded form, preserved so the
     * Preview pane can merge live code edits over the rich metadata
     * (dataRequirements / description / functionalRequirements / technicalDesign)
     * rather than rebuilding from `EditableCode` alone. Retrospective fix #5.
     */
    public SavedSpec: ComponentSpec | null = null;

    /**
     * True when the in-memory code (EditableCode) has diverged from what the
     * canvas can represent — e.g. hand-authored sections, computed JSX the
     * canvas-parser can't round-trip. Set by `hydrateCanvasFromCode`. The
     * Layout tab shows a warning banner so the user knows the canvas will
     * overwrite parts of the code on save. Retrospective fix #6.
     */
    public CanvasDiverged = false;
    public PreviewSearchTerm = '';
    public PreviewSearchResults: Array<{ ID: string; Label: string }> = [];

    /**
     * AppContext snapshot fed to the embedded `<mj-conversation-chat-area>`
     * so the agent sees the cockpit's current form + entity. Sourced from
     * `NavigationService.AppContextSnapshot$` — the same snapshot the floating
     * overlay uses — so both surfaces see identical context. Our cockpit-
     * specific state is pushed in via `SetAgentContext()` (which the Explorer
     * app shell merges into the snapshot's `AdditionalContext`).
     */
    public ChatAppContext: AppContextSnapshot | null = null;

    /**
     * Resolved ID of the Form Builder agent. Looked up once at init via
     * RunView. Bound to `<mj-conversation-chat-area>`'s `[defaultAgentId]`
     * so messages route directly to the Form Builder agent instead of going
     * through Sage — Sage doesn't author forms, the Form Builder agent does.
     * Null until the lookup resolves (or if the agent isn't installed); in
     * that case the chat falls back to Sage routing.
     */
    public FormBuilderAgentId: string | null = null;

    private appContextSubscription: Subscription | null = null;
    private entityEventSubscription: Subscription | null = null;

    /**
     * Conversation state for the embedded chat. Initially null/new; when the
     * user sends the first message, the chat-area emits `conversationCreated`
     * and we flip these so subsequent renders keep the same conversation.
     * Without this binding, the chat appears "stuck" on the welcome message
     * because the wrapper never picks up the new conversation ID.
     */
    public ChatConversation: MJConversationEntity | null = null;
    public ChatConversationId: string | null = null;
    public ChatIsNewConversation = true;

    /**
     * Pending message + attachments that came back on `conversationCreated`.
     * The chat-area emits these as part of its atomic state-handoff so the
     * parent can re-feed them after the conversation has an ID. The
     * chat-area's `pendingMessageConsumed` event tells us when to clear.
     * Without this loop, the user's first message creates the conversation
     * but never actually posts.
     */
    public ChatPendingMessage: string | null = null;
    public ChatPendingAttachments: unknown[] | null = null;

    /**
     * Thread state for the embedded chat. Mirrors the workspace shell's
     * pattern: chat-area emits `threadOpened` with a thread ID when the
     * user drills into a sub-thread, and `threadClosed` when they leave.
     * Forwarded back as `[threadId]` so the chat-area knows which thread
     * to render. Without these handlers, clicking a thread message in
     * the cockpit's chat appears to do nothing (the chat-area emits but
     * no one binds back).
     */
    public ChatThreadId: string | null = null;

    /**
     * Pending artifact pointer for the chat-area to scroll to / highlight
     * after navigation. Set when an artifact link inside the chat is
     * clicked (the chat-area asks us to surface a specific artifact
     * version) and cleared when consumed.
     */
    public ChatPendingArtifactId: string | null = null;
    public ChatPendingArtifactVersionNumber: number | null = null;

    /**
     * Environment ID for the embedded chat-area. Resource components in
     * Explorer accept this via ResourceData.Configuration; we fall back to
     * the default environment when not supplied.
     */
    public get ChatEnvironmentId(): string {
        return (this.Data?.Configuration?.['environmentId'] as string | undefined)
            || MJEnvironmentEntityExtended.DefaultEnvironmentID;
    }

    /**
     * Pane sizes (percent) for the 3-pane horizontal split. Initialized
     * from {@link FormBuilderPrefs} loaded out of UserInfoEngine on init;
     * mutated by the splitter's drag-end event; written back via
     * {@link savePrefs}.
     */
    public LeftPanePct = 22;
    public CenterPanePct = 56;
    public ChatPanePct = 22;

    /**
     * True when a form is "actively being shown" — either an existing
     * form is loaded (SelectedFormID set) or the user clicked New Form
     * (IsNewForm). The right-side chat pane is gated on this so empty
     * cockpits don't render an agent shell against no subject.
     */
    public get HasActiveForm(): boolean {
        return this.IsNewForm || !!this.SelectedFormID;
    }

    public SelectedFormID: string | null = null;
    public SelectedFormName = '';
    public IsNewForm = false;
    public TargetEntityName: string | null = null;
    public Schema: CuratedFormSchema | null = null;
    public Canvas: FormCanvasModel | null = null;
    public SelectedElementId: string | null = null;
    public SelectedSectionId: string | null = null;
    public EditableCode = '';
    public DirtyFlag = false;

    public IsEntityPickerOpen = false;
    public EntityPickerSearch = '';
    public EntityChoices: ReadonlyArray<{ Name: string; DisplayName: string }> = [];

    public ShowFormOverrideDialog = false;
    public PendingOverrideComponentID: string | null = null;
    public PendingOverrideComponentName = '';
    public PendingOverrideEntityName = '';

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly notifications = inject(MJNotificationService);
    private readonly overrideService = inject(EntityFormOverrideService);
    private readonly conversationBridge = inject(ConversationBridgeService);

    /**
     * Name of the Application this cockpit lives in — must match the
     * `Application.Name` column. "Form Studio" is the nav-item LABEL
     * inside the "Component Studio" app, not a separate application;
     * the canonical Application row is named "Component Studio". See
     * `/metadata/applications/.component-studio-application.json`.
     */
    private static readonly COCKPIT_APP_NAME = 'Component Studio';

    /**
     * ID of the Application that owns this cockpit. Resolved at init from
     * `Metadata.Applications` (the in-memory cache populated at provider
     * bootstrap — NO RunView round-trip) and forwarded to the embedded
     * chat-area as `[applicationId]`, so conversations created inside this
     * cockpit are scoped to the Form Studio app and don't pollute the
     * main Chat list.
     */
    public CockpitApplicationId: string | null = null;

    private get provider(): IMetadataProvider {
        return this.ProviderToUse;
    }

    // Public so the template can bind it to <mj-conversation-chat-area>'s
    // [currentUser] input. The chat-area requires a UserInfo at mount time;
    // we gate it with @if(currentUser) in the template to avoid a null bind.
    public get currentUser(): UserInfo | null {
        return this.provider?.CurrentUser ?? null;
    }

    public async ngAfterViewInit(): Promise<void> {
        try {
            this.refreshEntityChoices();
            // Resolve the owning Application's ID once from the Metadata
            // cache. Used to scope chat conversations to this cockpit so
            // they don't pollute the main Chat list. Deterministic name-
            // based lookup against in-memory data — no RunView.
            const md = new Metadata();
            const app = md.Applications?.find(
                a => a.Name?.trim().toLowerCase() === FormBuilderResourceComponent.COCKPIT_APP_NAME.toLowerCase()
            );
            if (!app) {
                LogError(`FormBuilderResource: Application '${FormBuilderResourceComponent.COCKPIT_APP_NAME}' not found in Metadata cache — conversations will fall back to Global scope.`);
            }
            this.CockpitApplicationId = app?.ID ?? null;
            // Restore cockpit UI prefs (pane sizes, collapse, last tab)
            // from UserInfoEngine. Single JSON blob under FORM_BUILDER_PREFS_KEY.
            this.loadPrefs();
            await this.loadExistingForms();
            // Resolve the Form Builder agent ID once. Fire-and-forget — if it
            // doesn't resolve before the user opens chat, [defaultAgentId]
            // stays null and the chat falls back to Sage routing (degrades
            // gracefully rather than blocking init).
            void this.resolveFormBuilderAgentId();
            // Subscribe to the shell's published AppContextSnapshot so the
            // embedded chat-area sees the same {App, ActiveNavItem, User,
            // AdditionalContext} shape the floating overlay sees. Our
            // cockpit-specific state lands inside AdditionalContext via
            // `SetAgentContext()` below.
            this.appContextSubscription = this.navigationService.AppContextSnapshot$
                .subscribe(snapshot => {
                    this.ChatAppContext = snapshot;
                    this.cdr.markForCheck();
                });

            // BaseEntity event subscription — fires for both local and
            // remote saves (Redis pub/sub → GraphQL subscription on the
            // remote-invalidate side). When the Form Builder agent saves
            // a Component or EntityFormOverride row that belongs to the
            // form currently loaded in this cockpit, we reload so the
            // canvas/code/preview reflect the agent's edits without
            // requiring a manual refresh. Scoped tightly to the active
            // form's lineage to avoid cross-cockpit churn.
            this.entityEventSubscription = MJGlobal.Instance.GetEventListener(false)
                .subscribe(mjEvent => this.handleEntityEvent(mjEvent));
        } catch (err) {
            LogError(`FormBuilderResource.ngAfterViewInit: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
            this.NotifyLoadComplete();
            this.registerAgentContext();
        }
    }

    public override ngOnDestroy(): void {
        this.appContextSubscription?.unsubscribe();
        this.appContextSubscription = null;
        this.entityEventSubscription?.unsubscribe();
        this.entityEventSubscription = null;
        super.ngOnDestroy();
    }

    /**
     * MJGlobal event handler — fires whenever any BaseEntity in the app
     * is saved/deleted/etc. We filter aggressively here: only react to
     * `save` (local + remote-invalidate from the agent's server-side
     * action) on `MJ: Components` or `MJ: Entity Form Overrides`, and
     * only when the affected row belongs to the lineage of the form
     * currently loaded in this cockpit. Anything else bails immediately
     * — this listener runs for every entity save in the entire app, so
     * cheapness matters.
     */
    private handleEntityEvent(mjEvent: MJEvent): void {
        try {
            if (mjEvent.event !== MJEventType.ComponentEvent) return;
            if (mjEvent.eventCode !== BaseEntity.BaseEventCode) return;
            const evt = mjEvent.args as BaseEntityEvent | undefined;
            if (!evt) return;
            // Only care about completed saves and server-side invalidations.
            if (evt.type !== 'save' && evt.type !== 'remote-invalidate') return;

            const entityName = evt.entityName ?? evt.baseEntity?.EntityInfo?.Name;
            if (entityName !== 'MJ: Components' && entityName !== 'MJ: Entity Form Overrides') return;

            // Need a form actively loaded to compare against.
            if (!this.SelectedFormID && !this.ActiveOverrideID && !this.SelectedFormName) return;

            const savedID = evt.baseEntity?.PrimaryKey?.ToConcatenatedString() ?? null;

            if (entityName === 'MJ: Components') {
                // Match: same Component (in-place Modify on Pending) OR
                // same Name (Active path → new Pending sibling row in the
                // form's lineage). Either way the cockpit should refresh.
                const savedName = evt.baseEntity?.Get?.('Name') as string | undefined;
                const sameID = savedID && this.SelectedFormID && UUIDsEqual(savedID, this.SelectedFormID);
                const sameLineage = savedName && this.SelectedFormName && savedName === this.SelectedFormName;
                if (sameID || sameLineage) {
                    void this.handleAgentEditedActiveForm();
                }
            } else if (entityName === 'MJ: Entity Form Overrides') {
                // Override row change — either our exact override or any
                // override in the same lineage (new Pending sibling).
                // Reload the version rail so a new Pending row surfaces.
                const sameID = savedID && this.ActiveOverrideID && UUIDsEqual(savedID, this.ActiveOverrideID);
                if (sameID) {
                    void this.handleAgentEditedActiveForm();
                } else {
                    // Lineage match isn't free to compute here, but
                    // refreshing the version rail is cheap and covers it.
                    void this.loadVersionsForActiveForm();
                }
            }
        } catch (err) {
            LogError(`FormBuilderResource.handleEntityEvent: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Agent (or another client) just modified the Component / Override
     * for the form currently loaded in this cockpit. Reload the spec
     * from the same Component so the canvas + code + preview reflect
     * the new state without forcing a manual refresh.
     *
     * Guards: don't clobber unsaved user edits — if the cockpit has its
     * own `DirtyFlag` set, surface a notification instead of silently
     * overwriting. The user can manually re-pick the form when ready.
     */
    private async handleAgentEditedActiveForm(): Promise<void> {
        const formID = this.SelectedFormID;
        if (!formID) return;
        if (this.DirtyFlag) {
            this.notifications.CreateSimpleNotification(
                'Agent saved an update to this form, but you have unsaved local edits. Save or discard your changes to see the agent\'s version.',
                'info', 6000);
            return;
        }
        // Find the summary in the picker list so OnFormPicked can do its
        // standard load path (parses spec, rebuilds canvas, refreshes the
        // version rail, re-pushes agent context, etc.). If the row was
        // freshly created and isn't in the picker yet, reload the list.
        let summary = this.ExistingForms.find(f => UUIDsEqual(f.ID, formID));
        if (!summary) {
            await this.loadExistingForms();
            summary = this.ExistingForms.find(f => UUIDsEqual(f.ID, formID));
        }
        if (summary) {
            await this.OnFormPicked(summary);
            this.notifications.CreateSimpleNotification(
                'Form updated by agent — canvas refreshed.', 'success', 3500);
        } else {
            // Couldn't locate the row (deleted? out-of-scope?) — just
            // refresh the version rail so the UI isn't stale.
            await this.loadVersionsForActiveForm();
        }
    }

    /**
     * One-shot lookup of the Form Builder agent's ID. Used to bind the
     * chat-area's `[defaultAgentId]` so the cockpit's chat skips Sage routing
     * and addresses messages directly to the form-authoring specialist.
     *
     * Uses `AIEngineBase.Instance.Agents` (the in-memory cache that's
     * already loaded on app boot) rather than a RunView round-trip. This
     * also avoids the easy-to-trip entity-name typo (`'AI Agents'` vs
     * `'MJ: AI Agents'`) that previously left FormBuilderAgentId null and
     * silently fell back to Sage routing.
     */
    private async resolveFormBuilderAgentId(): Promise<void> {
        try {
            await AIEngineBase.Instance.Config(false);
            const agent = AIEngineBase.Instance.Agents
                ?.find(a => a.Name?.trim().toLowerCase() === 'form builder');
            if (agent) {
                this.FormBuilderAgentId = agent.ID;
                this.cdr.markForCheck();
            } else {
                LogError(`FormBuilderResource.resolveFormBuilderAgentId: 'Form Builder' agent not found in AIEngineBase cache`);
            }
        } catch (err) {
            LogError(`FormBuilderResource.resolveFormBuilderAgentId: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async loadExistingForms(): Promise<void> {
        const provider = this.provider;
        if (!provider) {
            this.ExistingForms = [];
            return;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const user = this.currentUser;

        // Batch both queries — Components for the form list + the
        // current user's overrides on those Components — so we don't
        // pay two round-trips. The override join is keyed on
        // ComponentID and filtered to the calling user's User-scope
        // rows (the only ones the cockpit can edit anyway).
        const [componentsResult, overridesResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Components',
                ExtraFilter: "Type='Form' OR Namespace LIKE 'Forms/%' OR Namespace LIKE '%/Forms/%'",
                Fields: ['ID', 'Name', 'Namespace', 'Status', 'Description'],
                OrderBy: 'Name',
                MaxRows: 500,
                ResultType: 'simple',
            },
            ...(user ? [{
                EntityName: 'MJ: Entity Form Overrides',
                ExtraFilter: `UserID='${user.ID}' AND Scope='User'`,
                Fields: ['ComponentID', 'Status'],
                MaxRows: 500,
                ResultType: 'simple' as const,
            }] : []),
        ], user ?? undefined);

        if (!componentsResult.Success) {
            LogError(`FormBuilderResource.loadExistingForms (components): ${componentsResult.ErrorMessage}`);
            this.ExistingForms = [];
            return;
        }
        // Build a quick lookup ComponentID → override Status. If the
        // override query failed we fall through with an empty map and
        // every form just shows no override badge — degrades cleanly.
        const overrideStatusByComponentID = new Map<string, 'Active' | 'Inactive' | 'Pending'>();
        if (overridesResult?.Success) {
            for (const row of (overridesResult.Results ?? []) as Array<{ ComponentID: string; Status: string }>) {
                if (row.Status === 'Active' || row.Status === 'Inactive' || row.Status === 'Pending') {
                    overrideStatusByComponentID.set(NormalizeUUID(row.ComponentID), row.Status);
                }
            }
        }

        this.ExistingForms = ((componentsResult.Results ?? []) as Array<{
            ID: string;
            Name: string;
            Namespace: string | null;
            Status: string | null;
            Description: string | null;
        }>).map(r => ({
            ID: r.ID,
            Name: r.Name,
            Namespace: r.Namespace,
            Status: r.Status,
            OverrideStatus: overrideStatusByComponentID.get(NormalizeUUID(r.ID)) ?? null,
            Description: r.Description,
            TargetEntityName: null,
        }));
    }

    public get filteredForms(): ReadonlyArray<FormComponentSummary> {
        const q = this.LeftRailFilter.trim().toLowerCase();
        if (!q) return this.ExistingForms;
        return this.ExistingForms.filter(f =>
            f.Name.toLowerCase().includes(q) ||
            (f.Namespace?.toLowerCase().includes(q) ?? false));
    }

    public OnLeftRailFilterChange(event: Event): void {
        this.LeftRailFilter = (event.target as HTMLInputElement).value;
        this.cdr.markForCheck();
    }

    public ToggleLeftRail(): void {
        this.LeftRailCollapsed = !this.LeftRailCollapsed;
        this.savePrefs();
        this.cdr.markForCheck();
    }

    public ToggleRightRail(): void {
        this.RightRailCollapsed = !this.RightRailCollapsed;
        this.cdr.markForCheck();
    }

    public ToggleChatPane(): void {
        this.ChatPaneCollapsed = !this.ChatPaneCollapsed;
        this.savePrefs();
        this.cdr.markForCheck();
    }

    public SetCenterPaneMode(mode: 'preview' | 'code' | 'layout'): void {
        this.CenterPaneMode = mode;
        this.savePrefs();
        this.cdr.markForCheck();
        if (mode === 'preview' && this.TargetEntityName && !this.PreviewRecord) {
            // Lazy-load on first switch — avoids the RunView on every form
            // pick when the user prefers Code or Layout.
            void this.loadPreviewRecord();
        }
    }

    /**
     * Live `ComponentSpec` for the Preview pane. Derived from the in-memory
     * `EditableCode` so the preview reflects unsaved edits — switching to
     * Preview while typing in Code shows the in-progress version, not the
     * last-saved one. Falls back to null when there's no code yet, in which
     * case the Preview pane shows a friendly empty state.
     */
    public get PreviewSpec(): import('@memberjunction/interactive-component-types').ComponentSpec | null {
        if (!this.SelectedFormName || !this.EditableCode || !this.EditableCode.trim()) {
            return null;
        }
        // Retrospective fix #5: merge live edits over the saved spec so the
        // Preview keeps dataRequirements / functionalRequirements / etc.
        // intact. Previously the getter rebuilt a stripped spec from code +
        // name only — components whose hooks depend on dataRequirements
        // would render in Preview without their data context.
        const base: Record<string, unknown> = this.SavedSpec
            ? { ...(this.SavedSpec as unknown as Record<string, unknown>) }
            : {};
        base.name = toComponentIdentifier(this.SelectedFormName);
        base.componentRole = 'form';
        base.location = 'embedded';
        base.code = this.EditableCode;
        base.title = this.SelectedFormName;
        return base as unknown as import('@memberjunction/interactive-component-types').ComponentSpec;
    }

    /**
     * Load a Top-1 record from the target entity to bind into the preview.
     * If the entity has no rows, we still mount the form against a synthetic
     * NewRecord() so the layout / styling / event handlers can be evaluated.
     */
    public async loadPreviewRecord(): Promise<void> {
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user || !this.TargetEntityName) return;
        this.PreviewLoading = true;
        this.PreviewError = null;
        this.cdr.markForCheck();
        try {
            const entityInfo = provider.EntityByName(this.TargetEntityName);
            if (!entityInfo) {
                this.PreviewError = `Entity '${this.TargetEntityName}' is not registered.`;
                return;
            }
            // Retrospective fix #7: order by NameField (then created-at) so
            // the "Top 1" is deterministic — different users see the same
            // record bound to the preview.
            const orderBy = entityInfo.NameField?.Name
                ? `${entityInfo.NameField.Name} ASC`
                : `__mj_CreatedAt DESC`;
            const rv = RunView.FromMetadataProvider(provider);
            const result = await rv.RunView<BaseEntity>({
                EntityName: this.TargetEntityName,
                MaxRows: 1,
                OrderBy: orderBy,
                ResultType: 'entity_object',
            }, user);
            if (result.Success && (result.Results?.length ?? 0) > 0) {
                this.PreviewRecord = result.Results[0];
                this.PreviewRecordIsReal = true;
                this.PreviewRecordLabel = this.recordLabel(this.PreviewRecord);
            } else {
                // No rows — fall back to a fresh NewRecord. The form still
                // mounts and the user can see how create-mode renders.
                const fresh = await provider.GetEntityObject<BaseEntity>(this.TargetEntityName, user);
                fresh.NewRecord();
                this.PreviewRecord = fresh;
                this.PreviewRecordIsReal = false;
                this.PreviewRecordLabel = 'New record (mock)';
            }
        } catch (err) {
            this.PreviewError = err instanceof Error ? err.message : String(err);
            LogError(`FormBuilderResource.loadPreviewRecord: ${this.PreviewError}`);
        } finally {
            this.PreviewLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** Pull a human label from the record's NameField or primary key. */
    private recordLabel(record: BaseEntity): string {
        const nameField = record.EntityInfo?.NameField?.Name;
        if (nameField) {
            const v = record.Get(nameField);
            if (v != null && String(v).trim().length > 0) return String(v);
        }
        if (record.PrimaryKey?.HasValue) return record.PrimaryKey.ToConcatenatedString();
        return record.EntityInfo?.Name ?? '(record)';
    }

    /**
     * Handle a LoadErrorChanged emit from <mj-interactive-form> in the
     * Preview pane. Surfaces the error in the cockpit's own error state so
     * users see "Preview failed" in the cockpit chrome instead of having
     * to look inside the form's React shell. Retrospective fix #10.
     */
    public OnPreviewLoadError(message: string | null): void {
        this.PreviewError = message;
        this.cdr.markForCheck();
    }

    public TogglePreviewPicker(): void {
        this.PreviewPickerOpen = !this.PreviewPickerOpen;
        this.cdr.markForCheck();
        // Auto-populate the dropdown with the top N records on open so the
        // user sees something to click immediately. Search-as-you-type
        // narrows from there. Without this, the dropdown opens to an empty
        // "Start typing…" hint, which is dead UX for entities where the
        // user just wants to flip between a handful of records.
        if (this.PreviewPickerOpen && this.TargetEntityName && this.PreviewSearchResults.length === 0) {
            void this.loadPreviewPickerResults('');
        }
    }

    /** Search-as-you-type for the preview record picker. */
    public async OnPreviewSearchInput(event: Event): Promise<void> {
        const term = (event.target as HTMLInputElement).value ?? '';
        this.PreviewSearchTerm = term;
        await this.loadPreviewPickerResults(term);
    }

    /**
     * Shared loader for the preview record picker. Empty term → top N
     * by name. Non-empty term → `LIKE %term%` on the name field. Both
     * paths share the result-mapping logic so the dropdown looks the same.
     */
    private async loadPreviewPickerResults(term: string): Promise<void> {
        if (!this.TargetEntityName) {
            this.PreviewSearchResults = [];
            this.cdr.markForCheck();
            return;
        }
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) return;
        const entity = provider.EntityByName(this.TargetEntityName);
        const nameField = entity?.NameField?.Name;
        if (!nameField) {
            this.PreviewSearchResults = [];
            return;
        }
        const trimmed = term.trim();
        const filter = trimmed.length === 0
            ? '' // no filter — engine returns top N ordered by name field
            : `${nameField} LIKE '%${trimmed.replace(/'/g, "''")}%'`;
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const result = await rv.RunView<BaseEntity>({
                EntityName: this.TargetEntityName,
                ExtraFilter: filter,
                OrderBy: `${nameField} ASC`,
                MaxRows: 8,
                ResultType: 'entity_object',
            }, user);
            this.PreviewSearchResults = (result.Results ?? []).map(r => ({
                ID: r.PrimaryKey?.ToConcatenatedString() ?? '',
                Label: this.recordLabel(r),
            }));
            this.cdr.markForCheck();
        } catch (err) {
            LogError(`FormBuilderResource.loadPreviewPickerResults: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** User picked a different record from the search results — re-bind preview. */
    public async OnPreviewRecordPicked(item: { ID: string; Label: string }): Promise<void> {
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user || !this.TargetEntityName) return;
        const entityInfo = provider.EntityByName(this.TargetEntityName);
        if (!entityInfo) return;
        try {
            const rec = await provider.GetEntityObject<BaseEntity>(this.TargetEntityName, user);
            const pk = new CompositeKey();
            pk.LoadFromURLSegment(entityInfo, item.ID);
            if (await rec.InnerLoad(pk)) {
                this.PreviewRecord = rec;
                this.PreviewRecordIsReal = true;
                this.PreviewRecordLabel = item.Label;
                this.PreviewPickerOpen = false;
                this.PreviewSearchTerm = '';
                this.PreviewSearchResults = [];
                this.cdr.markForCheck();
            }
        } catch (err) {
            LogError(`FormBuilderResource.OnPreviewRecordPicked: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Direct-edit handler used by `<mj-code-editor>` via ngModelChange.
     * Receives the new editor value as a string. Marks the form dirty so
     * the Save button activates; the Layout-tab canvas is *not* re-derived
     * here (avoids destructive round-trips when the JSX has hand-authored
     * bits the canvas-parser can't model).
     */
    /**
     * Chat-area emitted `conversationCreated` after the user sent the first
     * message — switch the embedded chat out of "new conversation" mode so
     * subsequent renders show the live conversation thread. Without this,
     * the chat appears stuck on its welcome screen.
     */
    public OnChatConversationCreated(event: {
        conversation: MJConversationEntity;
        pendingMessage?: string;
        pendingAttachments?: unknown[];
    }): void {
        // Atomic state-flip matching the overlay's pattern: set conversation
        // identity AND re-feed the pending message/attachments in the same
        // change-detection cycle. The chat-area picks them up on the next
        // render and actually delivers the message.
        this.ChatPendingMessage = event.pendingMessage ?? null;
        this.ChatPendingAttachments = (event.pendingAttachments ?? null) as unknown[] | null;
        this.ChatConversation = event.conversation;
        this.ChatConversationId = event.conversation.ID;
        this.ChatIsNewConversation = false;
        this.cdr.markForCheck();
    }

    /**
     * Chat-area finished delivering the pending message — clear the buffer
     * so a re-render doesn't try to send it again.
     */
    public OnChatPendingMessageConsumed(): void {
        this.ChatPendingMessage = null;
        this.ChatPendingAttachments = null;
        this.cdr.markForCheck();
    }

    // ── Chat surface event wiring ────────────────────────────────────
    // The embedded <mj-conversation-chat-area> emits the same outbound
    // events the main workspace listens for; without handlers, clicks
    // inside the chat (entity record links, artifact links, task
    // navigation, thread drill-down) silently do nothing. Each handler
    // below mirrors the workspace's behavior but routes through
    // NavigationService so the target opens as an Explorer tab.

    /**
     * Chat-area emitted `openEntityRecord` — user clicked an entity link
     * inside an agent reply. Open the record as a new Explorer tab via
     * NavigationService (same as the workspace's actionable-command
     * path, but executed directly here since the cockpit has no
     * intermediate workspace shell).
     */
    public OnChatOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
        try {
            this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
        } catch (err) {
            LogError(`FormBuilderResource.OnChatOpenEntityRecord: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Chat-area emitted a generic `navigationRequest` (cross-resource
     * navigation, e.g. "go to Collections with this artifact"). Route
     * via NavigationService.OpenNavItemByName.
     */
    public OnChatNavigationRequest(event: NavigationRequest): void {
        void this.navigationService.OpenNavItemByName(
            event.navItemName,
            event.params,
            event.appId
        );
    }

    /**
     * Chat-area emitted `taskClicked` — user clicked a task pill in an
     * agent reply. The workspace switches to its Tasks tab; the cockpit
     * has no Tasks tab, so open the task record directly.
     */
    public OnChatTaskClicked(task: MJTaskEntity): void {
        try {
            const key = CompositeKey.FromID(task.ID);
            this.navigationService.OpenEntityRecord('MJ: Tasks', key);
        } catch (err) {
            LogError(`FormBuilderResource.OnChatTaskClicked: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Chat-area emitted `artifactLinkClicked` — user clicked an artifact
     * link inside a message. Conversation-type links point at another
     * conversation in main Chat; collection-type links point at a
     * collection. Both route into the main Chat / Collections app via
     * NavigationService so the artifact opens in its native context
     * (the cockpit is form-authoring focused, not the right surface to
     * render arbitrary artifacts inline).
     */
    public OnChatArtifactLinkClicked(event: { type: 'conversation' | 'collection'; id: string }): void {
        const navItemName = event.type === 'conversation' ? 'Conversations' : 'Collections';
        const paramKey = event.type === 'conversation' ? 'conversationId' : 'collectionId';
        void this.navigationService.OpenNavItemByName(navItemName, { [paramKey]: event.id });
    }

    /** Chat-area emitted `conversationRenamed` — purely informational for the cockpit (no convo list to animate). */
    public OnChatConversationRenamed(event: { conversationId: string; name: string; description: string }): void {
        // Mirror the locally-held conversation reference so the header
        // title in the chat-area stays in sync if we ever re-render. The
        // chat-area updates its own title via the conversation entity,
        // but we keep this hook here for parity with the workspace shell.
        if (this.ChatConversation && this.ChatConversation.ID === event.conversationId) {
            this.ChatConversation.Name = event.name;
            if (event.description !== undefined) {
                this.ChatConversation.Description = event.description;
            }
            this.cdr.markForCheck();
        }
    }

    /** Thread drill-down: chat-area opened a sub-thread. Track ID so the chat-area renders it. */
    public OnChatThreadOpened(threadId: string): void {
        this.ChatThreadId = threadId;
        this.cdr.markForCheck();
    }

    /** Thread drill-down: chat-area closed the sub-thread. Clear ID. */
    public OnChatThreadClosed(): void {
        this.ChatThreadId = null;
        this.cdr.markForCheck();
    }

    /** Pending artifact handed off to the chat-area (e.g. via deep link) has been consumed. */
    public OnChatPendingArtifactConsumed(): void {
        this.ChatPendingArtifactId = null;
        this.ChatPendingArtifactVersionNumber = null;
        this.cdr.markForCheck();
    }

    // ── Persisted UI preferences (UserInfoEngine) ────────────────────

    /**
     * Load cockpit prefs from UserInfoEngine. Called once during
     * ngAfterViewInit. Missing / unparseable values fall through to the
     * defaults declared at field-init time — never throws.
     */
    private loadPrefs(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(FORM_BUILDER_PREFS_KEY);
            if (!raw) return;
            const prefs = JSON.parse(raw) as FormBuilderPrefs;
            if (typeof prefs.leftPanePct === 'number')   this.LeftPanePct   = prefs.leftPanePct;
            if (typeof prefs.centerPanePct === 'number') this.CenterPanePct = prefs.centerPanePct;
            if (typeof prefs.chatPanePct === 'number')   this.ChatPanePct   = prefs.chatPanePct;
            if (typeof prefs.leftCollapsed === 'boolean')  this.LeftRailCollapsed = prefs.leftCollapsed;
            if (typeof prefs.chatCollapsed === 'boolean')  this.ChatPaneCollapsed = prefs.chatCollapsed;
            if (prefs.lastCenterPaneMode === 'preview' ||
                prefs.lastCenterPaneMode === 'code' ||
                prefs.lastCenterPaneMode === 'layout') {
                this.CenterPaneMode = prefs.lastCenterPaneMode;
            }
        } catch (err) {
            LogError(`FormBuilderResource.loadPrefs: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Write the current cockpit UI state back to UserInfoEngine, debounced
     * (the engine handles debouncing internally). Called from the splitter's
     * drag-end event, the collapse toggles, and the center-pane mode setter.
     */
    private savePrefs(): void {
        const prefs: FormBuilderPrefs = {
            leftPanePct: this.LeftPanePct,
            centerPanePct: this.CenterPanePct,
            chatPanePct: this.ChatPanePct,
            leftCollapsed: this.LeftRailCollapsed,
            chatCollapsed: this.ChatPaneCollapsed,
            lastCenterPaneMode: this.CenterPaneMode,
        };
        try {
            UserInfoEngine.Instance.SetSettingDebounced(FORM_BUILDER_PREFS_KEY, JSON.stringify(prefs));
        } catch (err) {
            LogError(`FormBuilderResource.savePrefs: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Splitter drag-end handler. `sizes` from angular-split is an array of
     * `SplitAreaSize` values (number | '*' for auto-size); for our
     * percent-unit splitter only numbers come through, but the union forces
     * us to filter. Order matches the visible-pane order: [left?, center, chat?].
     */
    public OnSplitterDragEnd(event: { sizes: ReadonlyArray<number | '*'> }): void {
        const sizes = event.sizes ?? [];
        const numeric = (i: number): number | undefined => {
            const v = sizes[i];
            return typeof v === 'number' ? v : undefined;
        };
        let i = 0;
        if (!this.LeftRailCollapsed)  this.LeftPanePct   = numeric(i++) ?? this.LeftPanePct;
        this.CenterPanePct = numeric(i++) ?? this.CenterPanePct;
        if (!this.ChatPaneCollapsed)  this.ChatPanePct   = numeric(i++) ?? this.ChatPanePct;
        this.savePrefs();
    }

    public OnEditableCodeChange(next: string | null | undefined): void {
        const value = next ?? '';
        if (value === this.EditableCode) return;
        this.EditableCode = value;
        this.DirtyFlag = true;
        this.cdr.markForCheck();
    }

    /**
     * Load all Component versions sharing the active form's Name. The version
     * rail renders these; `Active` / `Pending` flags come from cross-referencing
     * EntityFormOverrides for the user. Tolerates missing user / empty results
     * — version rail just shows nothing in that case.
     */
    public async loadVersionsForActiveForm(): Promise<void> {
        if (!this.SelectedFormName) {
            this.Versions = [];
            this.ActiveVersionID = null;
            return;
        }
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) {
            this.Versions = [];
            return;
        }
        this.VersionsLoading = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const escapedName = this.SelectedFormName.replace(/'/g, "''");
            const result = await rv.RunView<{
                ID: string;
                Name: string;
                Version: string;
                VersionSequence: number;
                Status: string;
                __mj_UpdatedAt: string;
            }>({
                EntityName: 'MJ: Components',
                ExtraFilter: `Name='${escapedName}'`,
                Fields: ['ID', 'Name', 'Version', 'VersionSequence', 'Status', '__mj_UpdatedAt'],
                OrderBy: 'VersionSequence DESC',
                ResultType: 'simple',
            }, user);
            if (!result.Success) {
                LogError(`FormBuilderResource.loadVersionsForActiveForm: ${result.ErrorMessage}`);
                this.Versions = [];
                return;
            }
            // Cross-reference overrides to tag Active / Pending versions for
            // the current user. Single query, joined client-side — small N.
            const overrideResult = await rv.RunView<{
                ComponentID: string;
                Status: string;
            }>({
                EntityName: 'MJ: Entity Form Overrides',
                ExtraFilter: `UserID='${user.ID}' AND ComponentID IN (${(result.Results ?? []).map(r => `'${r.ID}'`).join(',') || "''"})`,
                Fields: ['ComponentID', 'Status'],
                ResultType: 'simple',
            }, user);
            // Delegate the join to the pure helper — testable without
            // booting Angular DI. See form-builder-version-rail.helpers.ts.
            this.Versions = joinVersionsWithOverrides(
                result.Results ?? [],
                overrideResult.Results ?? [],
            );
            this.ActiveVersionID = pickActiveVersionID(this.Versions) ?? this.SelectedFormID;
        } finally {
            this.VersionsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Open the chat overlay with the active-form context already set. The
     * overlay is mounted at the app root; we don't construct it here. The
     * agent context is kept fresh by `registerAgentContext()` (called on
     * every form change).
     *
     * Side effect: also un-collapses the chat pane so the user sees the
     * surface they just clicked.
     */
    public OnOpenInChat(): void {
        // Make sure the agent context reflects the *current* form state
        // before we open the chat. registerAgentContext() reads SelectedForm*
        // and pushes through NavigationService so the next user message in
        // chat carries ActiveForm.
        this.registerAgentContext();
        this.ChatPaneCollapsed = false;
        // Pop the floating chat overlay. The bridge is the decoupled
        // request channel — see ConversationBridgeService.RequestExpandOverlay.
        this.conversationBridge.RequestExpandOverlay();
        this.cdr.markForCheck();
    }

    /**
     * Re-point this form's Active override at the picked version. Called
     * from the version rail "Make Active" button. Delegates to the
     * `Activate Interactive Form Version` action when the version is Pending,
     * otherwise delegates to `Revert Interactive Form` (re-point Active
     * override to an older Component row in the same Name lineage).
     */
    public async OnActivateVersion(version: ComponentVersionRow): Promise<void> {
        // The action layer is the source of truth for the swap semantics;
        // here we just translate the click into the right server call and
        // reload. We intentionally don't try to mimic the action's logic on
        // the client — keeps the lifecycle in one place.
        const provider = this.provider;
        if (!provider || !this.currentUser) return;
        if (version.IsActive) return;   // already active, no-op

        // We don't have a direct action-invoke utility in the resource
        // component, so we use the lighter-weight path: locate the override
        // currently pointing at this version, OR (for Revert) the user's
        // currently-Active override + this version's ComponentID.
        try {
            const rv = RunView.FromMetadataProvider(provider);
            if (version.IsPending) {
                // Activate path: find the Pending override pointing at this version.
                const pending = await rv.RunView<{ ID: string }>({
                    EntityName: 'MJ: Entity Form Overrides',
                    ExtraFilter: `UserID='${this.currentUser.ID}' AND ComponentID='${version.ID}' AND Status='Pending'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                }, this.currentUser);
                const overrideID = pending.Results?.[0]?.ID;
                if (!overrideID) {
                    this.notifications.CreateSimpleNotification(
                        `Could not find a Pending override for ${version.Version}.`, 'warning', 3500);
                    return;
                }
                await this.overrideService.activateVersion(overrideID, this.currentUser ?? undefined, provider);
            } else {
                // Revert path: find the user's Active override for the same lineage.
                const active = await rv.RunView<{ ID: string }>({
                    EntityName: 'MJ: Entity Form Overrides',
                    ExtraFilter: `UserID='${this.currentUser.ID}' AND ComponentID IN (${this.Versions.map(v => `'${v.ID}'`).join(',')}) AND Status='Active'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                }, this.currentUser);
                const overrideID = active.Results?.[0]?.ID;
                if (!overrideID) {
                    this.notifications.CreateSimpleNotification(
                        `Could not find an Active override to revert.`, 'warning', 3500);
                    return;
                }
                await this.overrideService.revertToComponent(overrideID, version.ID, this.currentUser ?? undefined, provider);
            }
            await this.loadVersionsForActiveForm();
            this.notifications.CreateSimpleNotification(
                `Version ${version.Version} is now Active.`, 'info', 3000);
        } catch (err) {
            LogError(`FormBuilderResource.OnActivateVersion: ${err instanceof Error ? err.message : String(err)}`);
            this.notifications.CreateSimpleNotification(
                `Failed to switch version: ${err instanceof Error ? err.message : String(err)}`,
                'error', 4500);
        }
    }

    public async OnFormPicked(form: FormComponentSummary): Promise<void> {
        if (this.DirtyFlag && !this.confirmDiscard()) return;
        try {
            const provider = this.provider;
            if (!provider) return;
            const componentEntity = await provider.GetEntityObject<MJComponentEntity>(
                'MJ: Components',
                this.currentUser ?? undefined,
            );
            const loaded = await componentEntity.Load(form.ID);
            if (!loaded) {
                this.notifications.CreateSimpleNotification(
                    `Couldn't load form ${form.Name}.`, 'error', 4000);
                return;
            }
            const spec = this.parseSpec(componentEntity.Specification);
            const code = spec?.code ?? '';
            // Canonical entity binding lives on the EntityFormOverride row,
            // not in the generated code (which destructures entityName as a
            // host prop, never as a string literal). Look up an active override
            // for this Component to find the entity. Fall back to the regex
            // inference for legacy/hand-authored forms that don't have an
            // override yet.
            const entityName = await this.lookupEntityForComponent(form.ID)
                ?? this.inferTargetEntityFromCode(code);
            this.SelectedFormID = form.ID;
            this.SelectedFormName = form.Name;
            this.IsNewForm = false;
            this.EditableCode = code;
            // Retrospective fix #5: keep the full loaded spec around so
            // PreviewSpec can merge live code edits over the saved metadata.
            this.SavedSpec = spec;
            this.TargetEntityName = entityName;
            this.Schema = entityName
                ? buildCuratedFormSchema(entityName, provider)
                : null;
            this.hydrateCanvasFromCode();
            this.DirtyFlag = false;
            this.cdr.markForCheck();
            this.registerAgentContext();
            // Populate the version rail (fire-and-forget — the rail shows
            // a loading spinner until this resolves).
            this.loadVersionsForActiveForm();
            // Reset preview state — record will lazy-load on next switch
            // to the Preview tab against the (new) target entity.
            this.PreviewRecord = null;
            this.PreviewRecordIsReal = false;
            this.PreviewRecordLabel = '';
            this.PreviewError = null;
            // If the user is already on the Preview tab, kick off loading now.
            if (this.CenterPaneMode === 'preview' && this.TargetEntityName) {
                void this.loadPreviewRecord();
            }
        } catch (err) {
            LogError(`FormBuilderResource.OnFormPicked: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Look up an EntityFormOverride that points at this Component and return
     * the bound entity's name. Used by `OnFormPicked` to recover the target
     * entity for forms that have been activated against a real entity.
     */
    /**
     * Override metadata for the active form — captured at form-load time so
     * the agent context can carry it inline (no `Get Active Form For Entity`
     * round-trip needed). The Form Builder agent prompt's lifecycle rules
     * branch on whether an active override exists and what its scope/status
     * is; passing this snapshot upfront lets the agent jump straight to
     * `Modify Interactive Form` instead of guessing.
     */
    public ActiveOverrideID: string | null = null;
    public ActiveOverrideScope: string | null = null;
    public ActiveOverrideStatus: string | null = null;

    /** Whether the cockpit's override-status popover is open. */
    public OverrideStatusPickerOpen = false;
    /** Inline saving flag — disables the picker buttons mid-save. */
    public OverrideStatusSaving = false;

    /**
     * Allowed values for `EntityFormOverride.Status` mirrored from the
     * DB CHECK constraint / EntityFieldValue rows. Hardcoded for two
     * reasons: (a) they're stable schema enums, and (b) the picker UI
     * needs them statically to render labels + icons without round-trip.
     */
    public readonly OverrideStatusOptions: ReadonlyArray<{
        value: 'Active' | 'Inactive' | 'Pending';
        label: string;
        description: string;
        icon: string;
    }> = [
        { value: 'Active',   label: 'Active',   icon: 'fa-solid fa-circle-check',  description: 'Eligible for resolution — users see this form.' },
        { value: 'Inactive', label: 'Inactive', icon: 'fa-solid fa-circle-pause',  description: 'Ignored by the resolver — users fall back to the next match.' },
        { value: 'Pending',  label: 'Pending',  icon: 'fa-solid fa-hourglass-half', description: 'AI-authored, awaiting human activation. Resolver treats as Inactive.' },
    ];

    /** Toggle the override status popover. No-op when no override is loaded. */
    public ToggleOverrideStatusPicker(): void {
        if (!this.ActiveOverrideID) return;
        this.OverrideStatusPickerOpen = !this.OverrideStatusPickerOpen;
        this.cdr.markForCheck();
    }

    /**
     * Persist a new status on the currently-loaded EntityFormOverride.
     * Loads the entity, sets the status, saves, then mirrors the new
     * value onto the cockpit's local snapshot fields so the agent
     * context + UI stay in sync. The BaseEntity event subscription
     * above will also fire as a side effect, but our local guard
     * (`ActiveOverrideStatus` already up to date) keeps the cockpit
     * from triggering a spurious refresh.
     */
    public async OnOverrideStatusPicked(next: 'Active' | 'Inactive' | 'Pending'): Promise<void> {
        if (!this.ActiveOverrideID || this.ActiveOverrideStatus === next) {
            this.OverrideStatusPickerOpen = false;
            this.cdr.markForCheck();
            return;
        }
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) {
            this.notifications.CreateSimpleNotification(
                'No provider or user — cannot update status.', 'error', 4000);
            return;
        }
        this.OverrideStatusSaving = true;
        this.cdr.markForCheck();
        try {
            const override = await provider.GetEntityObject<MJEntityFormOverrideEntity>(
                'MJ: Entity Form Overrides', user);
            const loaded = await override.Load(this.ActiveOverrideID);
            if (!loaded) {
                this.notifications.CreateSimpleNotification(
                    'Could not load override row.', 'error', 4000);
                return;
            }
            override.Status = next;
            const saved = await override.Save();
            if (!saved) {
                this.notifications.CreateSimpleNotification(
                    override.LatestResult?.CompleteMessage ?? 'Save failed.',
                    'error', 5000);
                return;
            }
            this.ActiveOverrideStatus = next;
            this.OverrideStatusPickerOpen = false;
            this.registerAgentContext(); // push updated status into agent context
            this.notifications.CreateSimpleNotification(
                `Override is now ${next}.`, 'success', 3000);
        } catch (err) {
            LogError(`FormBuilderResource.OnOverrideStatusPicked: ${err instanceof Error ? err.message : String(err)}`);
            this.notifications.CreateSimpleNotification(
                `Failed to update status: ${err instanceof Error ? err.message : String(err)}`,
                'error', 5000);
        } finally {
            this.OverrideStatusSaving = false;
            this.cdr.markForCheck();
        }
    }

    private async lookupEntityForComponent(componentID: string): Promise<string | null> {
        const provider = this.provider;
        if (!provider) return null;
        const rv = RunView.FromMetadataProvider(provider);
        // Pull the override row's full identity (ID + EntityID + Scope +
        // Status) in one shot so callers also get the OverrideID snapshot
        // for the agent context. Top-1 by created-at DESC matches the prior
        // behavior — the most recently-stamped override for this Component.
        const result = await rv.RunView<{ ID: string; EntityID: string; Scope: string; Status: string }>({
            EntityName: 'MJ: Entity Form Overrides',
            Fields: ['ID', 'EntityID', 'Scope', 'Status'],
            ExtraFilter: `ComponentID='${componentID}'`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        }, this.currentUser ?? undefined);
        const row = result.Success ? result.Results?.[0] : null;
        if (!row) {
            this.ActiveOverrideID = null;
            this.ActiveOverrideScope = null;
            this.ActiveOverrideStatus = null;
            return null;
        }
        this.ActiveOverrideID = row.ID ?? null;
        this.ActiveOverrideScope = row.Scope ?? null;
        this.ActiveOverrideStatus = row.Status ?? null;
        const entityInfo = provider.Entities?.find(e => UUIDsEqual(e.ID, row.EntityID));
        return entityInfo?.Name ?? null;
    }

    public OnNewForm(): void {
        if (this.DirtyFlag && !this.confirmDiscard()) return;
        this.SelectedFormID = null;
        // Empty default — the user fills the toolbar name input, OR picking
        // an entity auto-fills it with the entity's identifier. Either path
        // produces a valid function name for the emitted code.
        this.SelectedFormName = '';
        this.IsNewForm = true;
        this.EditableCode = '';
        this.TargetEntityName = null;
        this.Schema = null;
        this.Canvas = null;
        this.SelectedElementId = null;
        this.SelectedSectionId = null;
        this.DirtyFlag = false;
        // Retrospective #2 follow-up: clear leftover saved-spec / version /
        // preview state so the new form doesn't inherit the prior load's
        // metadata in PreviewSpec.
        this.SavedSpec = null;
        this.Versions = [];
        this.ActiveVersionID = null;
        this.PreviewRecord = null;
        this.PreviewRecordIsReal = false;
        this.PreviewRecordLabel = '';
        this.PreviewError = null;
        this.CanvasDiverged = false;
        this.cdr.markForCheck();
        this.registerAgentContext();
    }

    private confirmDiscard(): boolean {
        return window.confirm('You have unsaved changes. Discard them?');
    }

    /**
     * Best-effort parse of the `Specification` JSON column on MJ: Components.
     * Returns `null` if the column is empty or malformed — callers should
     * fall back to empty-code initialization in that case.
     */
    private parseSpec(specJson: string | null): ComponentSpec | null {
        if (!specJson) return null;
        try {
            return JSON.parse(specJson) as ComponentSpec;
        } catch (err) {
            LogError(`FormBuilderResource.parseSpec: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Best-effort attempt to extract the target entity from a form
     * Component's stored code. Form components conventionally reference
     * `host.entityName` or `entityName="…"`. If we can't infer it, the user
     * needs to re-pick from the entity dropdown.
     */
    private inferTargetEntityFromCode(code: string): string | null {
        if (!code) return null;
        const m = code.match(/entityName\s*[:=]\s*['"]([^'"]+)['"]/);
        return m ? m[1] : null;
    }

    public OnFormNameInput(event: Event): void {
        this.SelectedFormName = (event.target as HTMLInputElement).value;
        this.markDirty();
        // Regenerate code so the emitted `function <Name>(...)` keeps in sync
        // with the name. Spec.name is set from this at save time.
        this.regenerateCode();
        this.cdr.markForCheck();
    }

    public ToggleEntityPicker(): void {
        this.IsEntityPickerOpen = !this.IsEntityPickerOpen;
        if (this.IsEntityPickerOpen) this.refreshEntityChoices();
        this.cdr.markForCheck();
    }

    public OnEntityPickerSearch(event: Event): void {
        this.EntityPickerSearch = (event.target as HTMLInputElement).value;
        this.cdr.markForCheck();
    }

    public get filteredEntityChoices(): ReadonlyArray<{ Name: string; DisplayName: string }> {
        const q = this.EntityPickerSearch.trim().toLowerCase();
        if (!q) return this.EntityChoices;
        return this.EntityChoices.filter(e =>
            e.Name.toLowerCase().includes(q) ||
            e.DisplayName.toLowerCase().includes(q));
    }

    public OnEntityPicked(entityName: string): void {
        const provider = this.provider;
        const schema = buildCuratedFormSchema(entityName, provider);
        if (!schema) {
            this.notifications.CreateSimpleNotification(
                `Couldn't load schema for ${entityName}.`, 'error', 4000);
            return;
        }
        this.IsEntityPickerOpen = false;
        this.TargetEntityName = entityName;
        this.Schema = schema;
        // For brand-new forms still without an explicit name, auto-fill an
        // identifier-friendly default based on the entity. The runtime
        // compiler requires the function name in the emitted code to match
        // `spec.name` exactly, so we drive both from the same source.
        if (this.IsNewForm && !this.SelectedFormName?.trim()) {
            this.SelectedFormName = toComponentIdentifier(schema.displayName);
        }
        const existing = this.EditableCode ?? '';
        if (existing.length > 0) {
            const result = parseCanvasFromCode(existing, schema);
            this.Canvas = result.canvas ?? buildEmptyCanvas(entityName, schema.displayName);
        } else if (this.IsNewForm) {
            // Retrospective fix #4: new-form flow seeds the canvas + code
            // from the CodeGen-equivalent scaffold. Previously the user got
            // an empty canvas — worse UX than the agent path. Now both paths
            // start from the same baseline.
            const scaffold = buildDefaultFormScaffold(entityName, provider);
            if (scaffold?.code) {
                this.EditableCode = scaffold.code;
                const result = parseCanvasFromCode(scaffold.code, schema);
                this.Canvas = result.canvas ?? buildEmptyCanvas(entityName, schema.displayName);
            } else {
                this.Canvas = buildEmptyCanvas(entityName, schema.displayName);
            }
        } else {
            this.Canvas = buildEmptyCanvas(entityName, schema.displayName);
        }
        this.SelectedElementId = null;
        this.SelectedSectionId = this.Canvas?.sections[0]?.id ?? null;
        this.regenerateCode();
        this.markDirty();
        this.cdr.markForCheck();
    }

    private refreshEntityChoices(): void {
        const provider = this.provider;
        if (!provider) {
            this.EntityChoices = [];
            return;
        }
        this.EntityChoices = (provider.Entities ?? [])
            .filter(e => e.AllowCreateAPI || e.AllowUpdateAPI)
            .map(e => ({ Name: e.Name, DisplayName: e.DisplayName ?? e.Name }))
            .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
    }

    public OnCanvasChanged(next: FormCanvasModel): void {
        this.Canvas = next;
        this.markDirty();
        this.regenerateCode();
        this.cdr.markForCheck();
    }

    public OnElementSelected(payload: { sectionId: string; elementId: string }): void {
        this.SelectedSectionId = null;
        this.SelectedElementId = payload.elementId;
        this.cdr.markForCheck();
    }

    public OnSectionSelected(sectionId: string): void {
        this.SelectedElementId = null;
        this.SelectedSectionId = sectionId;
        this.cdr.markForCheck();
    }

    public OnDeselected(): void {
        this.SelectedElementId = null;
        this.SelectedSectionId = null;
        this.cdr.markForCheck();
    }

    public OnElementChanged(next: FormCanvasElement): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => ({
                ...s,
                elements: s.elements.map(e => e.id === next.id ? next : e),
            })),
        };
        this.OnCanvasChanged(updated);
    }

    public OnSectionChanged(next: FormCanvasSection): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => s.id === next.id ? next : s),
        };
        this.OnCanvasChanged(updated);
    }

    public OnElementDeleted(elementId: string): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => ({
                ...s,
                elements: s.elements.filter(e => e.id !== elementId),
            })),
        };
        this.SelectedElementId = null;
        this.OnCanvasChanged(updated);
    }

    public OnSectionDeleted(sectionId: string): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.filter(s => s.id !== sectionId),
        };
        this.SelectedSectionId = null;
        this.OnCanvasChanged(updated);
    }

    public OnFieldAddedFromPalette(payload: { fieldName: string }): void {
        if (!this.Canvas) return;
        const target = this.focusedSection();
        if (!target) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => s.id === target.id
                ? {
                    ...s,
                    elements: [...s.elements, {
                        id: generateCanvasId('field'),
                        type: 'field',
                        fieldName: payload.fieldName,
                        span: 1,
                    }],
                }
                : s),
        };
        this.OnCanvasChanged(updated);
    }

    private focusedSection(): FormCanvasSection | null {
        if (!this.Canvas) return null;
        if (this.SelectedSectionId) {
            const s = this.Canvas.sections.find(sec => sec.id === this.SelectedSectionId);
            if (s) return s;
        }
        if (this.SelectedElementId) {
            const s = this.Canvas.sections.find(sec =>
                sec.elements.some(e => e.id === this.SelectedElementId));
            if (s) return s;
        }
        return this.Canvas.sections[0] ?? null;
    }

    private regenerateCode(): void {
        try {
            if (!this.Canvas || !this.Schema) return;
            // Drive the function name from SelectedFormName so the emitted
            // `function <Name>(...)` matches `spec.name` at save time. Falls
            // back to the entity displayName for safety.
            const name = this.SelectedFormName?.trim() || this.Schema.displayName;
            const code = generateCodeFromCanvas(this.Canvas, this.Schema, name);
            this.EditableCode = code;
        } catch (err) {
            LogError(`FormBuilderResource.regenerateCode: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private hydrateCanvasFromCode(): void {
        if (!this.TargetEntityName || !this.Schema || !this.EditableCode) {
            this.Canvas = null;
            this.CanvasDiverged = false;
            return;
        }
        const result = parseCanvasFromCode(this.EditableCode, this.Schema);
        this.Canvas = result.canvas
            ?? buildEmptyCanvas(this.TargetEntityName, this.Schema.displayName);
        // Retrospective fix #6: parseCanvasFromCode signals "code has stuff
        // the canvas can't represent" via `hasUnknownConstructs` (true when
        // the parser found JSX it couldn't round-trip) and `canvas: null`
        // (parse failed outright). Either is a divergence signal — surface
        // it via the Layout-tab banner so users know saving will overwrite.
        this.CanvasDiverged = !!result.hasUnknownConstructs || !result.canvas;
        this.SelectedElementId = null;
        this.SelectedSectionId = this.Canvas?.sections[0]?.id ?? null;
    }

    public async OnSave(): Promise<void> {
        if (!this.TargetEntityName) {
            this.notifications.CreateSimpleNotification(
                'Pick a target entity before saving.', 'warning', 4000);
            return;
        }
        if (!this.Canvas) {
            this.notifications.CreateSimpleNotification(
                'Nothing to save.', 'warning', 3000);
            return;
        }
        this.regenerateCode();

        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) {
            this.notifications.CreateSimpleNotification(
                'No metadata provider or current user — cannot save.', 'error', 4000);
            return;
        }

        try {
            const componentEntity = await provider.GetEntityObject<MJComponentEntity>(
                'MJ: Components', user);
            let existingSpec: ComponentSpec | null = null;
            if (this.SelectedFormID) {
                const loaded = await componentEntity.Load(this.SelectedFormID);
                if (!loaded) {
                    this.notifications.CreateSimpleNotification(
                        `Couldn't load existing form ${this.SelectedFormName}.`, 'error', 4000);
                    return;
                }
                existingSpec = this.parseSpec(componentEntity.Specification);
            } else {
                componentEntity.NewRecord();
                // Force the persisted Name to a valid JS identifier — the
                // runtime compiler requires `spec.name` to match the emitted
                // `function <Name>(...)`. Free-form names with spaces or
                // punctuation would mismatch and fail compilation.
                const safeName = toComponentIdentifier(
                    this.SelectedFormName?.trim() || `Form for ${this.TargetEntityName}`);
                componentEntity.Name = safeName;
                this.SelectedFormName = safeName;
                componentEntity.Type = 'Form';
                componentEntity.Status = 'Draft';
                // Version is required on MJ: Components. Use semver 1.0.0 for
                // the initial cut; subsequent saves bump VersionSequence via
                // CodeGen-managed flows. (We don't bump here — the Studio is
                // editing in place, not publishing.)
                componentEntity.Version = '1.0.0';
                componentEntity.VersionSequence = 1;
                // Regenerate code with the now-canonical name so the function
                // identifier in the emitted code matches `spec.name` exactly.
                this.regenerateCode();
            }
            const specToSave: ComponentSpec = {
                ...(existingSpec ?? {}),
                name: componentEntity.Name,
                code: this.EditableCode,
            } as ComponentSpec;
            componentEntity.Specification = JSON.stringify(specToSave, null, 2);

            const saved = await componentEntity.Save();
            if (!saved) {
                this.notifications.CreateSimpleNotification(
                    componentEntity.LatestResult?.CompleteMessage
                        ?? 'Save returned false with no diagnostic.',
                    'error', 6000);
                return;
            }

            this.SelectedFormID = componentEntity.ID;
            this.DirtyFlag = false;
            await this.loadExistingForms();
            this.notifications.CreateSimpleNotification(
                `Saved ${componentEntity.Name}.`, 'success', 3000);

            this.PendingOverrideComponentID = componentEntity.ID;
            this.PendingOverrideComponentName = componentEntity.Name;
            this.PendingOverrideEntityName = this.TargetEntityName;
            this.ShowFormOverrideDialog = true;
            this.cdr.markForCheck();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`FormBuilderResource.OnSave: ${message}`);
            this.notifications.CreateSimpleNotification(
                `Save failed: ${message}`, 'error', 6000);
        }
    }

    /**
     * Delete the currently-loaded form's Component AND any EntityFormOverride
     * rows pointing at it. Without the cascade, deleting just the Component
     * would leave orphan overrides whose resolver lookups fail silently.
     */
    public async OnDelete(): Promise<void> {
        if (!this.SelectedFormID) return;
        const formID = this.SelectedFormID;
        const formName = this.SelectedFormName || 'this form';
        if (!window.confirm(`Delete "${formName}" and any overrides pointing at it? This cannot be undone.`)) {
            return;
        }
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) {
            this.notifications.CreateSimpleNotification(
                'No metadata provider or current user — cannot delete.', 'error', 4000);
            return;
        }
        try {
            // Step 1 — delete overrides pointing at this Component.
            const rv = RunView.FromMetadataProvider(provider);
            const overridesResult = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Entity Form Overrides',
                Fields: ['ID'],
                ExtraFilter: `ComponentID='${formID}'`,
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            const overrideIDs = overridesResult.Success
                ? (overridesResult.Results ?? []).map(r => r.ID)
                : [];
            for (const id of overrideIDs) {
                const override = await provider.GetEntityObject<MJEntityFormOverrideEntity>(
                    'MJ: Entity Form Overrides', user);
                if (await override.Load(id)) {
                    const ok = await override.Delete();
                    if (!ok) {
                        LogError(`FormBuilderResource.OnDelete: override ${id} delete failed: ${override.LatestResult?.CompleteMessage ?? 'unknown'}`);
                    }
                }
            }

            // Step 2 — delete the Component itself.
            const componentEntity = await provider.GetEntityObject<MJComponentEntity>(
                'MJ: Components', user);
            const loaded = await componentEntity.Load(formID);
            if (!loaded) {
                this.notifications.CreateSimpleNotification(
                    `Form ${formName} not found — may have already been deleted.`, 'warning', 4000);
                await this.loadExistingForms();
                this.OnNewForm();
                return;
            }
            const deleted = await componentEntity.Delete();
            if (!deleted) {
                this.notifications.CreateSimpleNotification(
                    componentEntity.LatestResult?.CompleteMessage ?? 'Delete returned false.',
                    'error', 6000);
                return;
            }
            this.notifications.CreateSimpleNotification(
                `Deleted ${formName}${overrideIDs.length ? ` and ${overrideIDs.length} override(s)` : ''}.`,
                'success', 3000);
            await this.loadExistingForms();
            // Reset the canvas to an empty state.
            this.SelectedFormID = null;
            this.SelectedFormName = '';
            this.IsNewForm = false;
            this.TargetEntityName = null;
            this.Schema = null;
            this.Canvas = null;
            this.EditableCode = '';
            this.DirtyFlag = false;
            this.cdr.markForCheck();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`FormBuilderResource.OnDelete: ${message}`);
            this.notifications.CreateSimpleNotification(
                `Delete failed: ${message}`, 'error', 6000);
        }
    }

    public async OnFormOverrideDialogConfirm(result: FormOverrideDialogResult): Promise<void> {
        this.ShowFormOverrideDialog = false;
        if (!this.PendingOverrideComponentID) {
            this.cdr.markForCheck();
            return;
        }
        const user = this.currentUser;
        if (!user) {
            this.notifications.CreateSimpleNotification(
                'No current user — cannot create override.', 'error', 4000);
            return;
        }
        const writeResult = await this.overrideService.CreateOverride(
            this.PendingOverrideComponentID, result, user, this.provider);
        if (writeResult.Success) {
            this.notifications.CreateSimpleNotification(
                `Override "${result.Name}" created.`, 'success', 4000);
        } else {
            this.notifications.CreateSimpleNotification(
                writeResult.Error ?? 'Failed to create override.', 'warning', 6000);
        }
        this.PendingOverrideComponentID = null;
        this.cdr.markForCheck();
    }

    public OnFormOverrideDialogDismiss(): void {
        this.ShowFormOverrideDialog = false;
        this.PendingOverrideComponentID = null;
        this.cdr.markForCheck();
    }

    /**
     * Compact list of the active entity's relationships, used to seed
     * the agent's context so it knows which related entities are
     * available to link to this form (sub-tables, lookups, etc.).
     *
     * Intentionally **summary-only** — name, relationship type, and
     * join fields. Full schemas for any related entity are still a
     * single `Get Entity Schema For Form` tool call away. Keeping this
     * list compact (~20-50 entries × ~80 chars = a few KB) avoids
     * token bloat while still giving the agent enough to plan without
     * asking the user "what entity links to this?".
     */
    private buildRelatedEntitiesSummary(): ReadonlyArray<{
        RelatedEntity: string;
        Type: string;
        EntityKeyField: string | null;
        RelatedEntityJoinField: string | null;
        DisplayName?: string;
    }> {
        const provider = this.provider;
        if (!provider || !this.TargetEntityName) return [];
        const entity = provider.EntityByName?.(this.TargetEntityName);
        if (!entity) return [];
        const rels = entity.RelatedEntities ?? [];
        return rels.map(r => {
            // Resolve RelatedEntity name from the ID. EntityRelationshipInfo
            // doesn't carry the friendly name directly; look it up from
            // the provider's cached entity list.
            const related = provider.Entities?.find(e => e.ID === r.RelatedEntityID);
            return {
                RelatedEntity: related?.Name ?? '(unknown)',
                Type: r.Type ?? 'One-to-Many',
                EntityKeyField: r.EntityKeyField ?? null,
                RelatedEntityJoinField: r.RelatedEntityJoinField ?? null,
                DisplayName: r.DisplayName ?? undefined,
            };
        });
    }

    private registerAgentContext(): void {
        try {
            const ctx: Record<string, unknown> = {
                ActiveForm: this.TargetEntityName
                    ? {
                        EntityName: this.TargetEntityName,
                        FormName: this.SelectedFormName,
                        SectionCount: this.Canvas?.sections.length ?? 0,
                        IsDirty: this.DirtyFlag,
                        // Identity of the currently-loaded Component +
                        // EntityFormOverride row, so the Form Builder
                        // agent can call `Modify Interactive Form` with
                        // the right OverrideID immediately — instead of
                        // calling `Create Interactive Form` and getting
                        // ALREADY_EXISTS, or having to round-trip through
                        // `Get Active Form For Entity` first. Null when
                        // the cockpit is mid-creation of a new form.
                        ComponentID: this.SelectedFormID,
                        OverrideID: this.ActiveOverrideID,
                        OverrideScope: this.ActiveOverrideScope,
                        OverrideStatus: this.ActiveOverrideStatus,
                        // Curated, LLM-friendly schema for the entity this
                        // form binds to (resolved FKs, value-list enums,
                        // stripped audit fields). Pre-built when the form
                        // loaded — see `buildCuratedFormSchema`. Including
                        // it inline means the agent doesn't have to spend
                        // a tool-call turn fetching schema for the obvious
                        // entity it's editing.
                        Schema: this.Schema ?? null,
                        // Lightweight relationship summary — just enough
                        // for the agent to know what related-entity tables
                        // / lookups / sub-forms it COULD add to this form.
                        // Full schemas for any of these are still one
                        // `Get Entity Schema For Form` action call away;
                        // we keep this list compact to avoid token bloat.
                        RelatedEntities: this.buildRelatedEntitiesSummary(),
                    }
                    : null,
            };
            // Push cockpit-specific state to NavigationService. The Explorer
            // shell merges this into the published AppContextSnapshot's
            // AdditionalContext, then re-publishes — our subscription in
            // ngAfterViewInit picks it up and refreshes `ChatAppContext` so
            // the embedded chat-area sees the latest form state. Same flow
            // the floating overlay uses; both surfaces stay in sync.
            this.navigationService.SetAgentContext(this, ctx);
            this.navigationService.SetAgentClientTools(this, [
                {
                    Name: 'UpdateForm',
                    Description: 'Replace the active form canvas with a new canvas model. Pass the new FormCanvasModel JSON.',
                    ParameterSchema: {
                        type: 'object',
                        properties: {
                            canvasModel: {
                                type: 'object',
                                description: 'A FormCanvasModel — sections + elements.',
                            },
                        },
                        required: ['canvasModel'],
                    },
                    Handler: async (params: Record<string, unknown>): Promise<unknown> => {
                        const canvasModel = params?.['canvasModel'] as FormCanvasModel | undefined;
                        if (!canvasModel) {
                            return { Success: false, Error: 'No canvasModel provided.' };
                        }
                        this.OnCanvasChanged(canvasModel);
                        return { Success: true };
                    },
                },
            ]);
        } catch (err) {
            LogError(`FormBuilderResource.registerAgentContext: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private markDirty(): void {
        this.DirtyFlag = true;
    }
}

/** Tree-shake protection — referenced from the dashboards module loader. */
export function LoadFormBuilderResourceComponent(): void {
    // Intentional no-op. Forces the bundler to keep this file's side effects
    // (the @RegisterClass call above) when consumers only do `import { ... }`.
}
