/**
 * Data hook for the new-conversation "agent rail" — the horizontal strip of
 * selectable AI agents shown when composing a new conversation. Wraps the
 * `loadAgents` service (RunView over the `AI Agents` entity) and decorates
 * each option with presentation metadata (avatar color + initial letter).
 */
import { useCallback, useEffect, useState } from 'react';
import { useMJ } from '@/providers/mj-provider';
import { loadAgents, type AgentOption } from '@/data/services/agents';
import { colorForAgent } from '@/theme/tokens';

/**
 * A loaded agent option augmented with UI chrome for the rail: a stable
 * per-agent avatar `color` (derived from the name) and an uppercase `initial`
 * used as the avatar glyph.
 */
export type AgentChip = AgentOption & { color: string; initial: string };

/**
 * Loads active top-level agents for the new-conversation agent rail and maps
 * them into {@link AgentChip}s. Auto-refreshes whenever the MJ provider
 * reaches `ready`; before then `agents` is `null` so the caller can render a
 * placeholder.
 *
 * Side effects: calls the `loadAgents` service (RunView on `AI Agents`) and
 * stores the result in local component state.
 *
 * @returns An object with:
 *  - `agents`: the loaded {@link AgentChip}[] or `null` until first load.
 *  - `loading`: `true` while a fetch is in flight.
 *  - `error`: the last fetch error, or `null`.
 *  - `refresh`: manually re-run the load (no-op unless MJ is `ready`).
 */
export function useAgents() {
    const { status } = useMJ();
    const [agents, setAgents] = useState<AgentChip[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        if (status !== 'ready') return;
        setLoading(true);
        setError(null);
        try {
            const list = await loadAgents();
            setAgents(list.map((a) => ({
                ...a,
                color: colorForAgent(a.name),
                initial: (a.name.trim().charAt(0) || 'A').toUpperCase(),
            })));
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { agents, loading, error, refresh };
}
