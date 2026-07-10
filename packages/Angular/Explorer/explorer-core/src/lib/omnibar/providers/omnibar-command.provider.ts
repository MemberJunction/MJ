import { RegisterClass } from '@memberjunction/global';
import type { BaseApplication } from '@memberjunction/ng-base-application';
import type { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import { firstValueFrom } from 'rxjs';
import { OmnibarProvider, OMNIBAR_NAV_KEY, OmnibarNavPayload } from '../omnibar-provider';

/**
 * '/' — commands: switch apps and jump to their nav items. Absorbs the old Ctrl+/
 * app command palette: same fuzzy scoring philosophy (exact > starts-with >
 * contains > description > initials) and the same UserInfoEngine-persisted recent
 * apps (via CommandPaletteService, which stays as the recents engine).
 */
@RegisterClass(OmnibarProvider, 'omnibar-commands')
export class OmnibarCommandProvider extends OmnibarProvider {
    public readonly TriggerChar = '/';
    public readonly Key = 'omnibar-commands';
    public override readonly Priority = 40;
    // 'Go to App', not 'Commands': this mode only NAVIGATES (apps + their nav
    // items) — a verb-of-execution label misled the first design review. Revisit
    // if the mode ever grows real executable commands (MJ Actions would back it).
    public readonly ModeLabel = 'Go to App';
    public override readonly Placeholder = 'App or destination…';

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const apps = await this.loadApps();
        const query = request.Query.trim().toLowerCase();
        const scored = apps
            .map((app) => ({ app, score: query.length === 0 ? 1 : this.matchScore(app, query) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score);

        const suggestions: MentionSuggestion[] = [];
        for (const { app } of scored) {
            suggestions.push(this.appSuggestion(app));
            // Nav items of strong matches surface as sub-destinations.
            if (query.length > 0 && suggestions.length < request.MaxResults) {
                suggestions.push(...await this.navItemSuggestions(app, query));
            }
            if (suggestions.length >= request.MaxResults) {
                break;
            }
        }
        return suggestions.slice(0, request.MaxResults);
    }

    /** Empty '/' query = recent apps first, then the full app list. */
    public override async EmptyStateSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const apps = await this.loadApps();
        const recents = await this.context.PaletteService?.GetRecentApps().catch(() => []) ?? [];
        const byRecency = [...apps].sort((a, b) => {
            const ra = recents.indexOf(a.ID);
            const rb = recents.indexOf(b.ID);
            return (ra === -1 ? recents.length : ra) - (rb === -1 ? recents.length : rb);
        });
        return byRecency.slice(0, request.MaxResults).map((app) => this.appSuggestion(app));
    }

    private async loadApps(): Promise<BaseApplication[]> {
        const manager = this.context.Apps;
        if (!manager) {
            return [];
        }
        try {
            // Applications (NOT AllApplications): the user's INSTALLED apps only —
            // system-wide apps the user hasn't installed would no-op on SwitchToApp.
            return await firstValueFrom(manager.Applications);
        } catch {
            return [];
        }
    }

    private appSuggestion(app: BaseApplication): MentionSuggestion {
        const nav: OmnibarNavPayload = { kind: 'app', appId: app.ID, appName: app.Name };
        return {
            type: 'app',
            id: app.ID,
            name: `Open ${app.Name}`,
            displayName: `Open ${app.Name}`,
            description: app.Description || 'Switch app',
            icon: app.Icon || 'fa-solid fa-grid-2',
            color: app.Color || undefined,
            data: { [OMNIBAR_NAV_KEY]: nav, group: 'Apps' },
        };
    }

    private async navItemSuggestions(app: BaseApplication, query: string): Promise<MentionSuggestion[]> {
        const items = await app.GetNavItems().catch(() => []);
        return items
            .filter((item) => item.Label?.toLowerCase().includes(query))
            .slice(0, 3)
            .map((item) => {
                const nav: OmnibarNavPayload = { kind: 'nav', appId: app.ID, navItemName: item.Label };
                return {
                    type: 'nav',
                    id: `${app.ID}:${item.Label}`,
                    name: `${app.Name} → ${item.Label}`,
                    displayName: `${app.Name} → ${item.Label}`,
                    description: 'Explorer navigation',
                    icon: item.Icon || 'fa-solid fa-diagram-next',
                    data: { [OMNIBAR_NAV_KEY]: nav, group: 'Navigation' },
                } satisfies MentionSuggestion;
            });
    }

    /**
     * Fuzzy scoring, same tiers as the retired Ctrl+/ palette component:
     * exact 1000 · starts-with 500 · contains 100 · description 50 · initials 25.
     */
    private matchScore(app: BaseApplication, query: string): number {
        const name = app.Name.toLowerCase();
        const desc = (app.Description || '').toLowerCase();
        if (name === query) return 1000;
        if (name.startsWith(query)) return 500;
        if (name.includes(query)) return 100;
        if (desc.includes(query)) return 50;
        const initials = app.Name.split(/\s+/).map((w) => w.charAt(0).toLowerCase()).join('');
        if (initials.startsWith(query)) return 25;
        return 0;
    }
}

/** Tree-shaking guard — referenced by LoadOmnibarProviders(). */
export function LoadOmnibarCommandProvider(): void {
    // intentional no-op
}
