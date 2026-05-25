import { useCallback, useEffect, useState } from 'react';
import { useMJ } from '@/providers/mj-provider';
import { loadAgents, type AgentOption } from '@/data/services/agents';
import { colorForAgent } from '@/theme/tokens';

export type AgentChip = AgentOption & { color: string; initial: string };

/**
 * Loads active top-level agents for the new-conversation agent rail.
 * Returns null until MJ is ready (caller renders nothing / a placeholder).
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
