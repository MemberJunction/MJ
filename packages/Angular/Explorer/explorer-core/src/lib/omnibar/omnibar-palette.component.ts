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
import { firstValueFrom } from 'rxjs';
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

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    /** Opens the palette, optionally pre-seeded (e.g. '/' from the legacy Ctrl+/ path). */
    public Open(initialQuery = ''): void {
        this.ensureProviders();
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
                this.SelectedIndex = Math.min(this.SelectedIndex + 1, Math.max(rows.length - 1, 0));
                this.cdr.markForCheck();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.SelectedIndex = Math.max(this.SelectedIndex - 1, 0);
                this.cdr.markForCheck();
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
            case 'Escape':
                event.preventDefault();
                this.Close();
                break;
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
            // Entity suggestion ('#' mode): drill in — re-seed the query, stay open.
            const entityName = suggestion.data?.['entityName'];
            if (typeof entityName === 'string') {
                this.SeedTrigger(`#${entityName.toLowerCase()} `);
            }
            return;
        }
        switch (nav.kind) {
            case 'record':
                this.navigation.OpenEntityRecord(nav.entityName, CompositeKey.FromID(nav.recordId));
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
        const apps = await firstValueFrom(this.appManager.AllApplications).catch(() => []);
        const chat = apps.find((a) => a.Name.trim().toLowerCase() === 'chat');
        if (chat) {
            await this.navigation.SwitchToApp(chat.ID, undefined, { agent: agentName });
        }
    }

    // ---------------------------------------------------------------
    // Query execution
    // ---------------------------------------------------------------

    private ensureProviders(): void {
        if (this.providers.length > 0) {
            return;
        }
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
            for (const term of recentSearches) {
                rows.push({
                    Suggestion: {
                        type: 'search',
                        id: `recent-search:${term}`,
                        name: term,
                        displayName: term,
                        description: 'Recent search',
                        icon: 'fa-solid fa-clock-rotate-left',
                        data: { nav: { kind: 'search', query: term } },
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
