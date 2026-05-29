/**
 * Wires the SearchEntities semantic hooks on `ProviderBase` using `AIEngine`
 * for embedding and `SimpleVectorServiceProvider` for vector lookup.
 *
 * Call this once during server startup, after AIEngine has been configured
 * (so the local embedding model is available). After registration,
 * `Provider.SearchEntities(entityName, text, { mode: 'semantic' | 'hybrid' })`
 * returns ranked results; without registration it degrades to lexical-only.
 *
 * @module @memberjunction/ai-engine
 */

import { ProviderBase, UserInfo } from '@memberjunction/core';
import { SimpleVectorServiceProvider } from '@memberjunction/ai-vectors-memory';
import { AIEngine } from './AIEngine';

/**
 * Register both `embedText` and `queryVectorIndex` hooks for SearchEntities.
 * Idempotent: safe to call repeatedly; later calls overwrite earlier hooks.
 */
export function RegisterSearchEntitiesAIHooks(): void {
    const vectorProvider = new SimpleVectorServiceProvider();

    ProviderBase.RegisterSearchEntitiesHooks({
        embedText: async (text: string, _contextUser?: UserInfo): Promise<number[] | null> => {
            try {
                const r = await AIEngine.Instance.EmbedTextLocal(text);
                return r?.result?.vector ?? null;
            } catch {
                return null;
            }
        },
        queryVectorIndex: async (entityDocumentId, queryVector, topK, contextUser) => {
            const result = await vectorProvider.QueryIndex(
                { id: entityDocumentId, vector: queryVector, topK } as never,
                contextUser
            );
            if (!result.success) return [];
            const data = result.data as { matches?: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> } | null;
            return data?.matches ?? [];
        },
    });
}
