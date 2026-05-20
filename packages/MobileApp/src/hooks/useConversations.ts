import { useCallback, useEffect, useState } from 'react';
import { useMJ } from '@/providers/mj-provider';
import { loadConversations, loadConversation, type ConversationListItem, type ConversationDetailLoad } from '@/data/services/conversations';
import { loadArtifact, type LoadedArtifact } from '@/data/services/artifacts';

/**
 * Hook for the conversation list screen.
 *
 * Behavior:
 * - When MJ provider is `ready`, fetches real conversations via RunView.
 * - When MJ provider is in any other state, returns `null` (the caller falls
 *   back to mocks). This keeps the design visible even before a JWT is set.
 */
export type UseConversationsState = {
    conversations: ConversationListItem[] | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
};

export function useConversations(): UseConversationsState {
    const { status } = useMJ();
    const [conversations, setConversations] = useState<ConversationListItem[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        if (status !== 'ready') return;
        setLoading(true);
        setError(null);
        try {
            const list = await loadConversations();
            setConversations(list);
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { conversations, loading, error, refresh };
}

/**
 * Hook for a single conversation thread + artifacts.
 */
export type UseConversationState = {
    data: ConversationDetailLoad | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
};

export function useConversation(conversationId: string | undefined): UseConversationState {
    const { status } = useMJ();
    const [data, setData] = useState<ConversationDetailLoad | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        if (status !== 'ready' || !conversationId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await loadConversation(conversationId);
            setData(result);
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setLoading(false);
        }
    }, [status, conversationId]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { data, loading, error, refresh };
}

/**
 * Loads a single artifact (latest version content + classification).
 */
export function useArtifact(artifactId: string | undefined) {
    const { status } = useMJ();
    const [artifact, setArtifact] = useState<LoadedArtifact | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (status !== 'ready' || !artifactId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const a = await loadArtifact(artifactId);
                if (!cancelled) setArtifact(a);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [status, artifactId]);

    return { artifact, loading, error };
}
