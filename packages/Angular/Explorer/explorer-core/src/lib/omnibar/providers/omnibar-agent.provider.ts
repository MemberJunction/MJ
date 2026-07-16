import { RegisterClass } from '@memberjunction/global';
import { DiscoverComposerTriggerProviders, ComposerTriggerProvider } from '@memberjunction/ng-composer';
import type { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import { OmnibarProvider, OMNIBAR_NAV_KEY, OmnibarNavPayload } from '../omnibar-provider';

/** The conversations composer plugin this provider delegates to (when present). */
const AGENT_MENTIONS_KEY = 'agent-mentions';

/**
 * '@' — talk to an agent: opens Conversations pre-addressed. Suggestion data comes
 * from the conversations package's own `agent-mentions` composer plugin, resolved
 * FROM THE COMPOSER REGISTRY AT QUERY TIME — no compile-time dependency on
 * ng-conversations, and graceful [] when the plugin isn't registered (e.g. a
 * deployment without the conversations package).
 */
@RegisterClass(OmnibarProvider, 'omnibar-agents')
export class OmnibarAgentProvider extends OmnibarProvider {
    public readonly TriggerChar = '@';
    public readonly Key = 'omnibar-agents';
    public override readonly Priority = 30;
    public readonly ModeLabel = 'Talk to an Agent';
    public override readonly Placeholder = 'Agent name…';

    private delegate: ComposerTriggerProvider | null | undefined;

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const inner = this.resolveDelegate();
        if (!inner) {
            return [];
        }
        try {
            const suggestions = await inner.GetSuggestions(request);
            // Agents only (the plugin also yields users); re-tag with the palette nav payload.
            return suggestions
                .filter((s) => s.type === 'agent')
                .map((s) => {
                    const nav: OmnibarNavPayload = { kind: 'agent', agentName: s.name };
                    return {
                        ...s,
                        description: s.description ? `${s.description} · opens chat pre-addressed` : 'Opens chat pre-addressed',
                        data: { ...(s.data ?? {}), [OMNIBAR_NAV_KEY]: nav, group: 'Agents' },
                    } satisfies MentionSuggestion;
                });
        } catch {
            return [];
        }
    }

    /** Empty '@' = the full permission-filtered agent list (delegate with empty query). */
    public override async EmptyStateSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        return this.GetSuggestions({ ...request, Query: '' });
    }

    private resolveDelegate(): ComposerTriggerProvider | null {
        if (this.delegate !== undefined) {
            return this.delegate;
        }
        this.delegate = DiscoverComposerTriggerProviders().find((p) => p.Key === AGENT_MENTIONS_KEY) ?? null;
        return this.delegate;
    }
}

/** Tree-shaking guard — referenced by LoadOmnibarProviders(). */
export function LoadOmnibarAgentProvider(): void {
    // intentional no-op
}
