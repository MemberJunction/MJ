import {
    ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter,
    OnDestroy, Output, ViewChild, inject,
} from '@angular/core';
import { CompositeKey, UserInfo } from '@memberjunction/core';
import { Metadata } from '@memberjunction/core';
import { MentionSuggestion } from '@memberjunction/ng-composer';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { SearchService, SearchScopeInfo } from '@memberjunction/ng-search';
import { FileOpenService } from '@memberjunction/ng-file-storage';
import { Subscription, firstValueFrom, skip } from 'rxjs';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import {
    DiscoverOmnibarProviders, GetOmnibarNavPayload, OmnibarProvider,
} from './omnibar-provider';
import { LoadOmnibarProviders } from './index';

/** One rendered result row: the suggestion + presentation extras. */
interface OmnibarRow {
    Suggestion: MentionSuggestion;
    /** Set only on the FIRST row of each group — drives the section header. */
    GroupLabel: string | null;
    /** 0-100 relevance bar (search mode only). */
    ScorePercent: number | null;
}

/** Debounce for the default (network-backed) search mode; trigger modes serve warm caches. */
const SEARCH_DEBOUNCE_MS = 300;

/** Max suggestions requested per keystroke. */
const MAX_RESULTS = 9;

/**
 * The unified Explorer command palette (Ctrl/Cmd+K): one surface for global
 * cross-source search (plain text), jump-to-record ('#'), commands & apps ('/'),
 * and agents ('@') — every mode a pluggable {@link OmnibarProvider}, discovered via
 * the MJ ClassFactory so OpenApps can add modes without touching this component.
 *
 * Design source of truth: plans/composer-adoption/mockups/omnibar-command-palette.html.
 */
@Component({
    standalone: false,
    selector: 'mj-omnibar-palette',
    templateUrl: './omnibar-palette.component.html',
    styleUrls: ['./omnibar-palette.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OmnibarPaletteComponent implements OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private navigation = inject(NavigationService);
    private appManager = inject(ApplicationManager);
    private search = inject(SearchService);
    private paletteService = inject(CommandPaletteService);
    private fileOpen = inject(FileOpenService);

    @ViewChild('paletteInput') private inputRef?: ElementRef<HTMLInputElement>;

    /** Palette visibility (open via {@link Open}; Escape/backdrop close). */
    public IsOpen = false;
    /** Raw input text including any leading trigger char. */
    public Query = '';
    public Rows: OmnibarRow[] = [];
    public RecentRows: OmnibarRow[] = [];
    public SelectedIndex = 0;
    public IsLoading = false;
    public Scopes: SearchScopeInfo[] = [];
    public SelectedScopeIDs: string[] = [];

    @Output() Opened = new EventEmitter<void>();
    @Output() Closed = new EventEmitter<void>();

    private providers: OmnibarProvider[] = [];
    private defaultProvider: OmnibarProvider | null = null;
    private byTrigger = new Map<string, OmnibarProvider>();
    private queryGeneration = 0;
    private debounceHandle: ReturnType<typeof setTimeout> | null = null;
    /** Element focused before the palette opened — restored on close (a11y). */
    private previousFocus: HTMLElement | null = null;
    private recentsSub: Subscription | null = null;

    // ---------------------------------------------------------------
    // Derived view state
    // ---------------------------------------------------------------

    /** The active trigger char ('' = default/global-search mode). */
    public get ActiveTriggerChar(): string {
        const first = this.Query.charAt(0);
        return this.byTrigger.has(first) ? first : '';
    }

    /** Query text with the trigger char stripped. */
    public get EffectiveQuery(): string {
        return this.ActiveTriggerChar ? this.Query.substring(1) : this.Query;
    }

    public get ActiveModeLabel(): string {
        return this.activeProvider?.ModeLabel ?? 'Search';
    }

    public get ActivePlaceholder(): string {
        return this.activeProvider?.Placeholder ?? 'Search everything — or type #, /, @ …';
    }

    /** Scope pills only apply to the cross-source search mode. */
    public get ShowScopes(): boolean {
        return this.ActiveTriggerChar === '' && this.EffectiveQuery.trim().length > 0;
    }

    public get ProviderCount(): number {
        return this.providers.length;
    }

    /** Hint chips for the empty state — one per non-default provider. */
    public get TriggerHints(): Array<{ Char: string; Label: string }> {
        return this.providers
            .filter((p) => p.TriggerChar !== '')
            .map((p) => ({ Char: p.TriggerChar, Label: p.ModeLabel }));
    }

    /** RecentRows render after the hint bar; selection indexes continue into them. */
    public get RecentBaseIndex(): number {
        return 0;
    }

    private get activeProvider(): OmnibarProvider | null {
        const char = this.ActiveTriggerChar;
        return char ? (this.byTrigger.get(char) ?? null) : this.defaultProvider;
    }

    private get selectableRows(): OmnibarRow[] {
        return this.Rows.length > 0 ? this.Rows : this.RecentRows;
    }

    /**
     * ARIA combobox wiring: the input keeps DOM focus while this points at the
     * virtually-highlighted option row, so screen readers announce selection moves.
     */
    public get ActiveDescendantId(): string | null {
        return this.selectableRows.length > 0 ? `ob-opt-${this.SelectedIndex}` : null;
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    /** Opens the palette, optionally pre-seeded (e.g. '/' from the legacy Ctrl+/ path). */
    public Open(initialQuery = ''): void {
        this.ensureProviders();
        this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.IsOpen = true;
        this.Query = initialQuery;
        this.Rows = [];
        this.SelectedIndex = 0;
        void this.loadScopes();
        void this.loadRecents();
        if (initialQuery.length > 0) {
            this.runQuery();
        }
        this.Opened.emit();
        this.cdr.markForCheck();
        // Input mounts via @if — focus next tick.
        setTimeout(() => this.inputRef?.nativeElement.focus(), 30);
    }

    public Close(): void {
        if (!this.IsOpen) {
            return;
        }
        this.IsOpen = false;
        this.Query = '';
        this.Rows = [];
        this.Closed.emit();
        this.cdr.markForCheck();
        // Return focus to where the user was (skip if that element left the DOM).
        if (this.previousFocus?.isConnected) {
            this.previousFocus.focus();
        }
        this.previousFocus = null;
    }

    public Toggle(initialQuery = ''): void {
        if (this.IsOpen) {
            this.Close();
        } else {
            this.Open(initialQuery);
        }
    }

    ngOnDestroy(): void {
        if (this.debounceHandle != null) {
            clearTimeout(this.debounceHandle);
        }
        this.recentsSub?.unsubscribe();
    }

    // ---------------------------------------------------------------
    // Input handling
    // ---------------------------------------------------------------

    public OnQueryChange(value: string): void {
        this.Query = value;
        this.SelectedIndex = 0;
        this.runQuery();
    }

    public OnInputKeydown(event: KeyboardEvent): void {
        const rows = this.selectableRows;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.moveSelection(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.moveSelection(-1);
                break;
            case 'Enter': {
                event.preventDefault();
                const row = rows[this.SelectedIndex];
                if (row) {
                    this.Execute(row.Suggestion);
                } else if (this.ActiveTriggerChar === '' && this.EffectiveQuery.trim().length > 1) {
                    // No rows yet (still loading / no matches): honest escape hatch to full search.
                    this.openFullSearch(this.EffectiveQuery.trim());
                }
                break;
            }
        }
    }

    /**
     * Dialog-level keys (bubbled from anywhere inside the palette):
     * - Escape closes from any focused element, not just the input.
     * - Tab follows the natural visual order — input → scope pills → mode chips →
     *   the selected result row (roving tabindex) — and TRAPS at the ends so focus
     *   cycles inside the dialog instead of escaping to the page underneath.
     *   (Design review: Tab must reach the three mode chips, not skip them.)
     */
    public OnPaletteKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.Close();
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        const root = this.host.nativeElement.querySelector('.omnibar-palette') as HTMLElement | null;
        if (!root) {
            return;
        }
        const focusables = Array.from(root.querySelectorAll<HTMLElement>('input, button, .ob-row[tabindex="0"]'))
            .filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) {
            return;
        }
        const active = document.activeElement as HTMLElement | null;
        if (!event.shiftKey && active === focusables[focusables.length - 1]) {
            event.preventDefault();
            focusables[0].focus();
        } else if (event.shiftKey && active === focusables[0]) {
            event.preventDefault();
            focusables[focusables.length - 1].focus();
        }
    }

    /** Keys on a focused result row (rows are real focus stops via roving tabindex). */
    public OnRowKeydown(event: KeyboardEvent, suggestion: MentionSuggestion): void {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.moveSelection(1, true);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.moveSelection(-1, true);
                break;
            case 'Enter':
                event.preventDefault();
                this.Execute(suggestion);
                break;
        }
    }

    /**
     * Keyboard-driven selection move: wraps at both ends (standard picker behavior)
     * and keeps the highlighted row visible. Mouse hover sets SelectedIndex directly
     * in the template and deliberately does NOT scroll — auto-scrolling under the
     * pointer would fight the user's hand. When the move originates from a focused
     * row (roving tabindex), DOM focus follows the selection.
     */
    private moveSelection(delta: 1 | -1, focusRow = false): void {
        const count = this.selectableRows.length;
        if (count === 0) {
            return;
        }
        this.SelectedIndex = (this.SelectedIndex + delta + count) % count;
        this.cdr.markForCheck();
        const row = this.host.nativeElement.querySelector<HTMLElement>(`#ob-opt-${this.SelectedIndex}`);
        row?.scrollIntoView({ block: 'nearest' });
        if (focusRow) {
            row?.focus();
        }
    }

    /** Hint-chip click: seed the trigger char and refocus. */
    public SeedTrigger(char: string): void {
        this.Query = char;
        this.SelectedIndex = 0;
        this.runQuery();
        this.inputRef?.nativeElement.focus();
    }

    // ---------------------------------------------------------------
    // Scopes
    // ---------------------------------------------------------------

    public IsScopeSelected(id: string): boolean {
        return this.SelectedScopeIDs.includes(id);
    }

    public ToggleScope(id: string): void {
        this.SelectedScopeIDs = this.IsScopeSelected(id)
            ? this.SelectedScopeIDs.filter((s) => s !== id)
            : [...this.SelectedScopeIDs, id];
        this.cdr.markForCheck();
    }

    public ClearScopes(): void {
        this.SelectedScopeIDs = [];
        this.cdr.markForCheck();
    }

    // ---------------------------------------------------------------
    // Execution
    // ---------------------------------------------------------------

    /** Executes a suggestion: navigate per its payload, or re-seed for entity drill-in. */
    public Execute(suggestion: MentionSuggestion): void {
        const nav = GetOmnibarNavPayload(suggestion);
        if (!nav) {
            return; // foreign suggestion with no navigation — nothing to execute
        }
        // Default-mode queries count as "searches" even when the user executes a
        // suggestion that navigates directly (no full ExecuteSearch downstream to
        // record them). Trigger-mode fragments ('#accounts ac…') are NOT searches —
        // recording those would pollute recents. 'search' payloads skip too: the
        // results page records them with the real result count.
        const typed = this.EffectiveQuery.trim();
        if (this.ActiveTriggerChar === '' && typed.length > 0 && nav.kind !== 'search') {
            this.search.RecordRecentSearch(typed);
        }
        switch (nav.kind) {
            case 'record':
                this.navigation.OpenEntityRecord(nav.entityName, CompositeKey.FromID(nav.recordId));
                break;
            case 'entity-list':
                this.navigation.OpenDynamicView(nav.entityName);
                break;
            case 'search':
                this.openFullSearch(nav.query);
                return; // openFullSearch closes
            case 'app':
                void this.paletteService.TrackAppAccess(nav.appId);
                void this.navigation.SwitchToApp(nav.appId);
                break;
            case 'nav':
                void this.navigation.SwitchToApp(nav.appId, nav.navItemName);
                break;
            case 'agent':
                void this.openAgentChat(nav.agentName);
                break;
            case 'file':
                if (!this.fileOpen.OpenPreviewFromSearchResult(nav.rawMetadata)) {
                    void this.fileOpen.OpenFileFromSearchResult(nav.rawMetadata);
                }
                break;
        }
        this.Close();
    }

    private openFullSearch(query: string): void {
        const opts = this.SelectedScopeIDs.length > 0 ? { scopeIDs: [...this.SelectedScopeIDs] } : undefined;
        this.navigation.OpenSearch(query, opts);
        this.Close();
    }

    /** '@' selection: switch to the Chat app pre-addressed to the agent. */
    private async openAgentChat(agentName: string): Promise<void> {
        const apps = await firstValueFrom(this.appManager.Applications).catch(() => []);
        const chat = apps.find((a) => a.Name.trim().toLowerCase() === 'chat');
        if (chat) {
            // agentReq is a one-shot request nonce: the chat wrapper applies each
            // agent|nonce instruction exactly once, so URL↔tab-config sync echoes
            // of an already-consumed param can never re-stage the pre-address (and
            // wipe an in-progress composer draft), while a genuine re-tag of the
            // SAME agent still applies because it carries a fresh nonce.
            await this.navigation.SwitchToApp(chat.ID, undefined, {
                agent: agentName,
                agentReq: Date.now().toString(36),
            });
        }
    }

    // ---------------------------------------------------------------
    // Query execution
    // ---------------------------------------------------------------

    private ensureProviders(): void {
        if (this.providers.length > 0) {
            return;
        }
        // Kick off the persisted-recents load (idempotent; resolves via LoggedIn
        // replay). The legacy search composite used to be the only caller — with
        // the omnibar enabled it never renders, so prior-session recents were
        // invisible until the palette started requesting them itself.
        void this.search.LoadRecentSearches();
        // Refresh the empty-state Recent rows whenever recents change while the
        // palette is idle-open (skip(1): BehaviorSubject replays its current
        // value on subscribe, which loadRecents already read directly).
        this.recentsSub = this.search.RecentSearches$.pipe(skip(1)).subscribe(() => {
            if (this.IsOpen && this.Query.length === 0) {
                void this.loadRecents();
            }
        });
        LoadOmnibarProviders();
        this.providers = DiscoverOmnibarProviders();
        const context = {
            Search: this.search,
            Apps: this.appManager,
            PaletteService: this.paletteService,
            Navigation: this.navigation,
        };
        for (const provider of this.providers) {
            provider.Attach(context);
            if (provider.TriggerChar === '') {
                this.defaultProvider = this.defaultProvider ?? provider;
            } else if (!this.byTrigger.has(provider.TriggerChar)) {
                this.byTrigger.set(provider.TriggerChar, provider);
            }
        }
    }

    private runQuery(): void {
        if (this.debounceHandle != null) {
            clearTimeout(this.debounceHandle);
            this.debounceHandle = null;
        }
        const generation = ++this.queryGeneration;
        const provider = this.activeProvider;
        const query = this.EffectiveQuery;
        const isTriggerMode = this.ActiveTriggerChar !== '';

        if (!provider || (query.trim().length === 0 && !isTriggerMode)) {
            this.Rows = [];
            this.IsLoading = false;
            this.cdr.markForCheck();
            return;
        }

        const fire = () => void this.fetchSuggestions(provider, query, generation);
        if (isTriggerMode) {
            fire(); // warm caches — no debounce
        } else {
            this.IsLoading = this.Rows.length === 0;
            this.cdr.markForCheck();
            this.debounceHandle = setTimeout(fire, SEARCH_DEBOUNCE_MS);
        }
    }

    private async fetchSuggestions(provider: OmnibarProvider, query: string, generation: number): Promise<void> {
        const request = {
            Query: query,
            MaxResults: MAX_RESULTS,
            ContextUser: this.currentUser,
            Provider: null,
        };
        const suggestions = query.trim().length === 0
            ? await provider.EmptyStateSuggestions(request)
            : await provider.GetSuggestions(request);
        if (generation !== this.queryGeneration) {
            return; // stale response — a newer keystroke superseded it
        }
        this.Rows = this.toRows(suggestions);
        this.SelectedIndex = 0;
        this.IsLoading = false;
        this.cdr.markForCheck();
    }

    private toRows(suggestions: MentionSuggestion[]): OmnibarRow[] {
        let lastGroup: string | null = null;
        return suggestions.map((s) => {
            const group = typeof s.data?.['group'] === 'string' ? (s.data['group'] as string) : '';
            const isNewGroup = group.length > 0 && group !== lastGroup;
            if (group.length > 0) {
                lastGroup = group;
            }
            const score = typeof s.data?.['score'] === 'number' ? (s.data['score'] as number) : null;
            return {
                Suggestion: s,
                GroupLabel: isNewGroup ? group : null,
                ScorePercent: score != null ? Math.round(Math.max(0, Math.min(1, score)) * 100) : null,
            };
        });
    }

    private async loadScopes(): Promise<void> {
        try {
            this.Scopes = await this.search.LoadScopes();
            this.cdr.markForCheck();
        } catch {
            this.Scopes = [];
        }
    }

    /** Empty-state recents: recent searches + recent apps (best-effort). */
    private async loadRecents(): Promise<void> {
        const rows: OmnibarRow[] = [];
        try {
            const recentSearches = this.search.RecentSearches$.value.slice(0, 3);
            for (const recent of recentSearches) {
                rows.push({
                    Suggestion: {
                        type: 'search',
                        id: `recent-search:${recent.Query}`,
                        name: recent.Query,
                        displayName: recent.Query,
                        description: 'Recent search',
                        icon: 'fa-solid fa-clock-rotate-left',
                        data: { nav: { kind: 'search', query: recent.Query } },
                    },
                    GroupLabel: null,
                    ScorePercent: null,
                });
            }
        } catch {
            // recents are decorative — never block the palette
        }
        try {
            const commandProvider = this.byTrigger.get('/');
            if (commandProvider) {
                const apps = await commandProvider.EmptyStateSuggestions({
                    Query: '', MaxResults: 3, ContextUser: this.currentUser, Provider: null,
                });
                rows.push(...apps.map((s) => ({ Suggestion: s, GroupLabel: null, ScorePercent: null })));
            }
        } catch {
            // ditto
        }
        this.RecentRows = rows;
        this.cdr.markForCheck();
    }

    private get currentUser(): UserInfo | null {
        return Metadata.Provider?.CurrentUser ?? null;
    }
}

/** Tree-shaking guard for the palette component. */
export function LoadOmnibarPaletteComponent(): void {
    // intentional no-op
}
