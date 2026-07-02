/**
 * Data hooks for the conversation experience. Each hook wraps a service in
 * `@/data/services/{conversations,artifacts}` (which run RunView/RunQuery over
 * the MJ Conversation and Artifact entities) and exposes a small
 * `{ data, loading, error }` state object. Every hook is gated on the MJ
 * provider's `status === 'ready'`; before that it returns `null`/idle so
 * screens can fall back to mock/placeholder content.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMJ } from '@/providers/mj-provider';
import { loadConversations, loadConversation, type ConversationListItem, type ConversationDetailLoad } from '@/data/services/conversations';
import { loadArtifact, loadConversationArtifacts, type LoadedArtifact, type ArtifactSummary } from '@/data/services/artifacts';

/** Returned state shape for {@link useConversations} (the list screen). */
export type UseConversationsState = {
    conversations: ConversationListItem[] | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
};

/**
 * Hook for the conversation list screen.
 *
 * Behavior:
 * - When the MJ provider is `ready`, fetches real conversations via
 *   `loadConversations` (RunView over the Conversations entity).
 * - In any other provider state, `conversations` stays `null` so the caller
 *   can fall back to mocks — keeps the design visible before a JWT is set.
 *
 * Side effects: reads from the conversations service; auto-loads on mount and
 * whenever the provider status flips to `ready`.
 *
 * @returns {@link UseConversationsState} — the list (or `null`), `loading`,
 *   `error`, and a `refresh` handler that re-runs the fetch.
 */
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

/** Returned state shape for {@link useConversation} (a single thread). */
export type UseConversationState = {
    data: ConversationDetailLoad | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
};

/**
 * Hook for a single conversation thread plus its associated artifacts.
 * Loads via `loadConversation` (RunView over messages/details for the given
 * conversation) once the provider is `ready` and an id is supplied.
 *
 * @param conversationId The conversation to load; when `undefined` the hook
 *   stays idle and `data` remains `null`.
 * @returns {@link UseConversationState} — the loaded detail bundle (or `null`),
 *   `loading`, `error`, and a `refresh` handler.
 */
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
 * Loads a single artifact (its latest version content + classification) via
 * `loadArtifact`. Uses a cancellation flag so a late-resolving fetch can't set
 * state after the id changes or the component unmounts.
 *
 * @param artifactId The artifact to load; `undefined` keeps the hook idle.
 * @returns `{ artifact, loading, error }` — the loaded artifact (or `null`),
 *   in-flight flag, and last error. No manual refresh handler (re-fetches when
 *   `artifactId` or provider status changes).
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

/**
 * Loads the artifact summaries for a conversation (the artifact dock view):
 * category, preview snippet, and best-effort agent attribution, via
 * `loadConversationArtifacts`. Guarded by a cancellation flag.
 *
 * @param conversationId The conversation whose artifacts to summarize;
 *   `undefined` keeps the hook idle.
 * @returns `{ artifacts, loading, error }` — the {@link ArtifactSummary}[]
 *   (or `null`), in-flight flag, and last error.
 */
export function useConversationArtifacts(conversationId: string | undefined) {
    const { status } = useMJ();
    const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (status !== 'ready' || !conversationId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const list = await loadConversationArtifacts(conversationId);
                if (!cancelled) setArtifacts(list);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [status, conversationId]);

    return { artifacts, loading, error };
}
