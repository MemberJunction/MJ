import { MJGlobal } from '@memberjunction/global';
import { ComposerTriggerProvider, MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import type { NavigationService } from '@memberjunction/ng-shared';
import type { ApplicationManager } from '@memberjunction/ng-base-application';
import type { SearchService } from '@memberjunction/ng-search';
import type { CommandPaletteService } from '../command-palette/command-palette.service';

/**
 * What selecting an omnibar suggestion DOES. Every {@link OmnibarProvider}
 * suggestion carries one of these in `MentionSuggestion.data['nav']`; the palette
 * executes it through the existing navigation seams (NavigationService et al.) —
 * providers never navigate themselves.
 */
export type OmnibarNavPayload =
    | { kind: 'record'; entityName: string; recordId: string }
    | { kind: 'search'; query: string; scopeIDs?: string[] }
    | { kind: 'app'; appId: string; appName: string }
    | { kind: 'nav'; appId: string; navItemName: string }
    | { kind: 'entity-list'; entityName: string }
    | { kind: 'agent'; agentName: string }
    | { kind: 'file'; fileName: string; rawMetadata?: string };

/** Key under which the nav payload rides in `MentionSuggestion.data`. */
export const OMNIBAR_NAV_KEY = 'nav';

/** Convenience: read a suggestion's nav payload (null when absent/foreign). */
export function GetOmnibarNavPayload(suggestion: MentionSuggestion): OmnibarNavPayload | null {
    const nav = suggestion.data?.[OMNIBAR_NAV_KEY];
    return nav ? (nav as OmnibarNavPayload) : null;
}

/**
 * Angular-owned services the palette hands to providers before use. Providers are
 * ClassFactory-instantiated (no Angular DI), so anything injectable arrives here.
 * All members optional — a provider must degrade gracefully (return []) when a
 * dependency it needs wasn't supplied.
 */
export interface OmnibarContext {
    Search?: SearchService;
    Apps?: ApplicationManager;
    PaletteService?: CommandPaletteService;
    Navigation?: NavigationService;
}

/**
 * Pluggable mode for the Explorer command palette (the Ctrl+K omnibar).
 *
 * Registers under its OWN ClassFactory base — `@RegisterClass(OmnibarProvider, '<key>')`
 * — deliberately separate from the composer's `ComposerTriggerProvider` discovery, so
 * palette semantics (e.g. '#' = jump to a specific record) never leak into text
 * editors' mention discovery (where '#' means something else). The shape is shared
 * with the composer contract for consistency; the palette is the only consumer of
 * this base.
 *
 * `TriggerChar` conventions: '' (empty string) = the DEFAULT mode consulted when the
 * input has no trigger prefix (global search); any single char ('#', '/', '@', …)
 * claims that prefix. OpenApps extend the palette by registering additional
 * subclasses — no core changes required.
 */
export abstract class OmnibarProvider extends ComposerTriggerProvider {
    /** Human label for the palette's mode badge while this provider is active. */
    public abstract readonly ModeLabel: string;

    /** Placeholder shown in the input while this provider's trigger is active. */
    public readonly Placeholder: string = 'Type to search…';

    protected context: OmnibarContext = {};

    /**
     * Called by the palette after discovery, before any GetSuggestions call, with the
     * Angular services providers may need (ClassFactory construction has no DI).
     * Override to validate required members; keep it idempotent.
     */
    public Attach(context: OmnibarContext): void {
        this.context = context;
    }

    /**
     * Suggestions for the EMPTY query in this mode (recents, hints). Default: none.
     * The palette shows these when the trigger is active but nothing is typed yet.
     */
    public async EmptyStateSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        void request;
        return [];
    }
}

/** One shared instance per registered subclass (providers are stateless facades). */
const instanceCache = new Map<unknown, OmnibarProvider>();

/**
 * Resolves every `@RegisterClass(OmnibarProvider, ...)` registration into a provider
 * list — highest-priority registration wins per key, results sorted by provider
 * `Priority` desc then `Key` asc. Returns [] gracefully when nothing is registered.
 */
export function DiscoverOmnibarProviders(excludedKeys?: string[]): OmnibarProvider[] {
    const factory = MJGlobal.Instance.ClassFactory;
    const registrations = factory.GetAllRegistrations(OmnibarProvider);
    if (!registrations || registrations.length === 0) {
        return [];
    }

    const excluded = new Set((excludedKeys ?? []).map((k) => k.trim().toLowerCase()));
    const seenKeys = new Set<string>();
    const providers: OmnibarProvider[] = [];

    for (const registration of registrations) {
        const normalizedKey = registration.Key?.trim().toLowerCase();
        if (!normalizedKey || seenKeys.has(normalizedKey) || excluded.has(normalizedKey)) {
            continue;
        }
        seenKeys.add(normalizedKey);

        // Winning registration per key — mirrors GetRegistration's priority semantics
        // (same pattern as DiscoverComposerTriggerProviders).
        const winner = factory.GetRegistration(OmnibarProvider, registration.Key);
        if (!winner?.SubClass) {
            continue;
        }
        let instance = instanceCache.get(winner.SubClass);
        if (!instance) {
            const ProviderConstructor = winner.SubClass as new () => OmnibarProvider;
            instance = new ProviderConstructor();
            instanceCache.set(winner.SubClass, instance);
        }
        providers.push(instance);
    }

    return providers.sort((a, b) => (b.Priority - a.Priority) || a.Key.localeCompare(b.Key));
}
