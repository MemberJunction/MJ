import { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/**
 * Loads a realtime session's recording through **authenticated MJStorage** and returns a browser
 * blob object URL suitable for an `<audio>`/`RealtimeEvidencePlaybackComponent` source.
 *
 * Uses the ownership-gated `GetRealtimeRecordingAudio` GraphQL query, which reads the bytes
 * server-side via `GetObject` on the file's own storage account and returns base64 — so the audio
 * never travels over a public pre-signed link (which the Box driver can't reliably create anyway).
 *
 * The caller owns the returned URL's lifetime — call `URL.revokeObjectURL(url)` when the player is
 * torn down / a different recording is selected, to avoid leaking the blob.
 *
 * @param provider The metadata provider for the active server (a `GraphQLDataProvider` under the hood).
 * @param agentSessionId The `MJ: AI Agent Sessions` id whose recording to load.
 * @returns A blob object URL, or `null` when there is no recording or it can't be read.
 */
export async function LoadRealtimeRecordingAudioUrl(
    provider: IMetadataProvider, agentSessionId: string
): Promise<string | null> {
    const gql = provider as unknown as GraphQLDataProvider;
    if (typeof gql?.ExecuteGQL !== 'function') {
        return null;
    }
    const query = `
        query GetRealtimeRecordingAudio($id: String!) {
            GetRealtimeRecordingAudio(agentSessionId: $id) { Success AudioBase64 MimeType ErrorMessage }
        }`;
    const result = await gql.ExecuteGQL(query, { id: agentSessionId });
    const payload = result?.GetRealtimeRecordingAudio as
        { Success?: boolean; AudioBase64?: string; MimeType?: string; ErrorMessage?: string } | undefined;
    if (!payload?.Success || !payload.AudioBase64) {
        if (payload?.ErrorMessage) {
            console.warn(`[RealtimeRecordingAudio] Could not load recording for ${agentSessionId}: ${payload.ErrorMessage}`);
        }
        return null;
    }
    const binary = atob(payload.AudioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([bytes], { type: payload.MimeType || 'audio/webm' }));
}
