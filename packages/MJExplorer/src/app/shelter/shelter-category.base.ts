import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, RunView, UserInfo } from '@memberjunction/core';
import { MJEnvironmentEntityExtended, MJConversationEntity } from '@memberjunction/core-entities';
import { RecordOpenedEvent, ViewRelatedRecordNavigation } from '@memberjunction/ng-entity-viewer';
import type { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';

/**
 * One item in a category's rail, and what the body shows when it is selected.
 *
 * `kind` exists because the two page shapes need different components: an entity page renders
 * <mj-entity-viewer>, a query page renders <mj-query-viewer>. Keeping it a discriminated field
 * rather than two parallel arrays means the rail order and the body switch cannot drift apart.
 */
export interface ShelterCategoryPage {
    id: string;
    label: string;
    icon: string;
    kind: 'entity' | 'query' | 'pending' | 'agent';
    /** kind 'entity' — the entity whose grid to show. */
    entityName?: string;
    /** kind 'query' — resolved to an ID at runtime; see ResolveQueryIds. */
    queryName?: string;
    /** kind 'pending' — what is not built yet, named honestly on screen. */
    pendingNote?: string;
    /** kind 'agent' — resolved to an ID at runtime, exactly as queryName is; see ResolveAgentIds. */
    agentName?: string;
}

/**
 * MJ Academy — the shared shell for a TOP-BAR category that owns a side rail.
 *
 * WHY THIS EXISTS. MJ's nav metadata is FLAT: `MJApplicationEntity_IDefaultNavItem` is
 * `{ Label, Icon, ResourceType, RecordID, DriverClass, isDefault }` and has no children field. So a
 * two-level navigation -- four top-bar categories, each with its own sub-pages -- cannot be
 * expressed as metadata. The platform's answer, and what bizapps-accounting does across nine
 * shells, is that each top-bar item is a `Custom` resource whose COMPONENT owns a rail and swaps
 * its own body.
 *
 * Everything the rail is made of ships with MJ: <mj-page-layout>, <mj-page-header>, <mj-page-body>,
 * <mj-left-nav> and <mj-left-nav-content> are all in @memberjunction/ng-ui-components. We supply
 * the page list and nothing else -- no bespoke rail CSS, which is exactly what those components
 * exist to prevent.
 *
 * Each subclass is thin: a title, an icon, and its pages. It must ALSO carry its own
 * @RegisterClass DriverClass -- sharing one class across nav items makes the shell highlight every
 * item using it (learned in module 4).
 */
@Component({ template: '' })
export abstract class ShelterCategoryBase extends BaseResourceComponent {
    protected cdr = inject(ChangeDetectorRef);

    /** Shown in the page header and as the rail's mobile title. */
    public abstract get CategoryTitle(): string;
    public abstract get CategoryIcon(): string;
    /** The rail, in display order. The first entry is the landing page. */
    public abstract get Pages(): ShelterCategoryPage[];

    public ActivePageId = '';
    /** Query name -> ID, resolved once so <mj-query-viewer> can be pointed at it. */
    public QueryIds: Record<string, string> = {};
    /** Agent name -> ID, resolved once so the chat area can be pinned to ONE agent. */
    public AgentIds: Record<string, string> = {};

    /**
     * The chat area requires a real UserInfo at mount time, so the template gates on it.
     * Same pattern as FormBuilder's host.
     */
    public get CurrentUser(): UserInfo | null {
        return (this.ProviderToUse as unknown as { CurrentUser?: UserInfo })?.CurrentUser ?? null;
    }

    /** Conversations live in an environment; the default is right for an in-app assistant. */
    public get EnvironmentId(): string {
        return MJEnvironmentEntityExtended.DefaultEnvironmentID;
    }

    // ---------------------------------------------------------------------------------------
    // Chat host state.
    //
    // <mj-conversation-chat-area> does NOT own its conversation. When the user sends the first
    // message it creates the MJ: Conversations record, then EMITS `conversationCreated` and waits
    // for the host to bind that conversation back in as [conversation] + [pendingMessage]. A host
    // that ignores the event leaves the component parked on "Creating your conversation..." forever:
    // the row really is in the database, but nothing is ever bound to send the message into.
    //
    // That is a deliberate contract, not an oversight -- the host owns conversation identity, so a
    // workspace with a sidebar can switch conversations, deep-link one, and keep the URL honest.
    // Embedding the chat therefore means implementing the two handlers below. MJ's own chat-overlay
    // is the reference; this is the same shape, minus the parts a single-conversation surface has
    // no use for.
    // ---------------------------------------------------------------------------------------

    /** The live conversation once one exists. Null until the user's first message creates it. */
    public ChatConversation: MJConversationEntity | null = null;
    public ChatConversationId: string | null = null;
    /** True only until the first message lands -- it drives the empty-state composer. */
    public ChatIsNew = true;
    /** The first message, handed back to the component to send once the conversation is bound. */
    public ChatPendingMessage: string | null = null;
    public ChatPendingConversationId: string | null = null;

    /**
     * The chat area created the conversation and is handing it to us. Set every field in ONE
     * synchronous pass: the component re-renders on the next change-detection tick and reads all
     * of them together, so a partial update would race.
     */
    public OnChatConversationCreated(event: { conversation: MJConversationEntity; pendingMessage?: string }): void {
        this.ChatPendingMessage = event.pendingMessage || null;
        this.ChatPendingConversationId = event.conversation.ID;
        this.ChatConversationId = event.conversation.ID;
        this.ChatConversation = event.conversation;
        this.ChatIsNew = false;
        this.cdr.markForCheck();
    }

    /** The message was sent. Clear it, or it would be re-sent on the next render. */
    public OnChatPendingMessageConsumed(): void {
        this.ChatPendingMessage = null;
        this.ChatPendingConversationId = null;
        this.cdr.markForCheck();
    }

    // ── Resetting the chat between visitors ────────────────────────────────────────────────
    //
    // This page is a KIOSK. The next person to pick up the iPad must not find the last visitor's
    // conversation on screen -- which by then contains their name, their email, and which animals
    // they liked. Clearing it is a privacy requirement, not a convenience.
    //
    // Nulling the inputs is NOT enough on its own: the chat area caches a message-input component
    // per conversation it has visited and holds its own `messages` array, so a reset that only
    // rebinds leaves fragments of the old conversation behind. The reliable move is to destroy the
    // component and build a new one -- which the `@for ... track` around the page body already
    // does for free. Bumping this token changes the tracked key, so Angular tears the whole body
    // down and constructs it fresh, with no reset path inside the component to trust.

    /** Bumped by {@link ResetChat}; part of the `@for` track key. See {@link PageTrackKey}. */
    public ChatResetToken = 0;

    /** True once "Start over" has been tapped once and is waiting for the confirming tap. */
    public ChatResetArmed = false;
    private chatResetTimer?: ReturnType<typeof setTimeout>;

    /**
     * The `@for` key for the page body. For an agent page it folds in {@link ChatResetToken}, so a
     * reset recreates the chat; every other page keeps its plain id and is unaffected.
     */
    public PageTrackKey = (page: ShelterCategoryPage): string =>
        page.kind === 'agent' ? `${page.id}#${this.ChatResetToken}` : page.id;

    /**
     * Two taps, on purpose. One stray thumb on a shared iPad should not throw away a conversation
     * someone is in the middle of -- but a modal confirm is the wrong instrument for a kiosk, and
     * would pull in a dialog dependency this page does not otherwise need. So the button arms
     * itself for four seconds and disarms on its own if nobody follows through.
     */
    public OnResetChatClicked(): void {
        if (!this.ChatResetArmed) {
            this.ChatResetArmed = true;
            this.chatResetTimer = setTimeout(() => {
                this.ChatResetArmed = false;
                this.cdr.markForCheck();
            }, 4000);
            return;
        }
        this.clearChatResetTimer();
        this.ResetChat();
    }

    /** Drop every trace of the current visitor and rebuild the chat. */
    public ResetChat(): void {
        this.ChatConversation = null;
        this.ChatConversationId = null;
        this.ChatIsNew = true;
        this.ChatPendingMessage = null;
        this.ChatPendingConversationId = null;
        this.ChatResetArmed = false;
        this.ChatResetToken++;
        this.cdr.markForCheck();
    }

    private clearChatResetTimer(): void {
        if (this.chatResetTimer) {
            clearTimeout(this.chatResetTimer);
            this.chatResetTimer = undefined;
        }
    }

    public override ngOnDestroy(): void {
        this.clearChatResetTimer();
        super.ngOnDestroy?.();
    }

    public override ngOnInit(): void {
        super.ngOnInit();
        this.ActivePageId = this.Pages[0]?.id ?? '';
        void this.resolveQueryIds();
        void this.resolveAgentIds();
    }

    /** The rail. One unlabelled section -- a header above three items would be noise. */
    public get RailSections(): MJLeftNavSection[] {
        const items: MJLeftNavItem[] = this.Pages.map((p) => ({
            id: p.id,
            label: p.label,
            icon: p.icon,
            disabled: p.kind === 'pending',
        }));
        return [{ items }];
    }

    public get ActivePage(): ShelterCategoryPage | undefined {
        return this.Pages.find((p) => p.id === this.ActivePageId);
    }

    /**
     * The active page as a single-element list, so the template can drive it with `@for ... track
     * page.id`. That track key is the ONLY thing that makes Angular destroy and recreate the body
     * when the rail changes, and it is load-bearing -- see the note in the template.
     */
    public get ActivePageAsList(): ShelterCategoryPage[] {
        const page = this.ActivePage;
        return page ? [page] : [];
    }

    public OnRailItemClicked(event: { id: string } | string): void {
        const id = typeof event === 'string' ? event : event?.id;
        if (id) {
            this.ActivePageId = id;
            this.cdr.markForCheck();
        }
    }

    /**
     * Turns query NAMES into IDs. <mj-query-viewer> takes a QueryId, and hardcoding a metadata UUID
     * into a component would couple the code to a specific database; the name is the stable
     * contract. One read for every query in the category.
     */
    private async resolveQueryIds(): Promise<void> {
        const names = this.Pages.filter((p) => p.kind === 'query' && p.queryName).map((p) => p.queryName!);
        if (names.length === 0) return;
        try {
            const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: Queries',
                    ExtraFilter: `Name IN (${quoted})`,
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                },
                this.ProviderToUse.CurrentUser,
            );
            if (res.Success) {
                for (const row of res.Results ?? []) this.QueryIds[row.Name] = row.ID;
                this.cdr.markForCheck();
            }
        } catch {
            // A missing ID leaves the query page empty rather than breaking the whole category.
        }
    }

    /**
     * Turns agent NAMES into IDs, mirroring resolveQueryIds. <mj-conversation-chat-area> takes a
     * defaultAgentId, and hardcoding a metadata UUID into a component would couple the code to one
     * database; the name is the stable contract.
     */
    private async resolveAgentIds(): Promise<void> {
        const names = this.Pages.filter((p) => p.kind === 'agent' && p.agentName).map((p) => p.agentName!);
        if (names.length === 0) return;
        try {
            const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `Name IN (${quoted})`,
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                },
                this.ProviderToUse.CurrentUser,
            );
            if (res.Success) {
                for (const row of res.Results ?? []) this.AgentIds[row.Name] = row.ID;
                this.cdr.markForCheck();
            }
        } catch {
            // A missing ID leaves the agent page with its "not available" note rather than breaking
            // the whole category.
        }
    }

    // ── Grid wiring. mj-entity-viewer only EMITS; a host that ignores these gets a grid whose
    //    New button and row clicks silently do nothing (module 4). ──────────────────────────
    public onCreateNewRecord(entityName: string): void {
        this.navigationService.OpenNewEntityRecord(entityName);
    }

    public onRecordOpened(event: RecordOpenedEvent): void {
        if (event?.entity && event.compositeKey) {
            this.navigationService.OpenEntityRecord(event.entity.Name, event.compositeKey);
        }
    }

    /** A link inside a cell -- a separate output from RecordOpened, so wiring one leaves the other dead. */
    public onOpenRelatedRecord(nav: ViewRelatedRecordNavigation): void {
        if (nav?.entityName && nav.recordKey != null) {
            this.navigationService.OpenEntityRecord(nav.entityName, CompositeKey.FromID(String(nav.recordKey)));
        }
    }

    /**
     * A row in the AGENT's data artifact was clicked. Same destination as a grid row, a THIRD
     * output to wire: the artifact viewer emits its own `openEntityRecord`, which the chat area
     * re-emits, and a host that binds only the grid's events leaves the agent's rows dead.
     *
     * The link only renders in the first place when the agent's payload gives each column its
     * entity lineage (`sourceEntityName` + `sourceFieldName`) and the field resolves to a primary
     * or foreign key -- see `resolveTargetEntity` in ng-query-viewer. `metadata.entityName` alone
     * does NOT make rows clickable; the column descriptors do.
     */
    public onOpenEntityRecordFromAgent(event: { entityName: string; compositeKey: CompositeKey }): void {
        if (event?.entityName && event.compositeKey) {
            this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
        }
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return this.CategoryTitle;
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return this.CategoryIcon;
    }
}
