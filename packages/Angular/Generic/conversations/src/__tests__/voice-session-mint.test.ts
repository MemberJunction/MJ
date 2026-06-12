import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { VoiceSessionService } from '../lib/services/voice-session.service';

/**
 * Session-mint passthrough — verifies the `StartRealtimeClientSession` mutation variables the
 * service sends, in particular the optional `coAgentId` (highest-precedence step of the server's
 * co-agent resolution chain) and the optional `configOverridesJson` (authorization-gated session
 * config overrides, e.g. `{"realtime":{"modelPreference":…}}`) alongside the previously-added
 * `preferredModelId`.
 *
 * The mint path lives behind the private `mintSession` method, reached through a narrow typed
 * seam (same approach as the client-tools suite) with the service's `Provider` swapped for a
 * fake whose `ExecuteGQL` captures the mutation + variables.
 */

/** The private surface under test — no `any`, just the member driven by the suite. */
interface VoiceSessionInternals {
  mintSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    preferredModelId?: string | null,
    clientTools?: Array<{ Name: string; Description: string; ParametersSchema: object }> | null,
    coAgentId?: string | null,
    configOverridesJson?: string | null
  ): Promise<unknown>;
}

function internals(service: VoiceSessionService): VoiceSessionInternals {
  return service as unknown as VoiceSessionInternals;
}

const OK_RESULT = {
  StartRealtimeClientSession: {
    AgentSessionId: 'session-1',
    ConversationId: 'conv-1',
    Provider: 'openai',
    Model: 'gpt-realtime',
    EphemeralToken: 'ek_abc',
    ExpiresAt: '2026-01-01T00:00:00Z',
    SessionConfigJson: '{}'
  }
};

describe('VoiceSessionService — mintSession variable passthrough', () => {
  let service: VoiceSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new VoiceSessionService();
    executeGQL = vi.fn(async () => OK_RESULT);
    // The service's gql() seam is just `this.Provider as GraphQLDataProvider` — a fake with
    // ExecuteGQL is all the mint path touches.
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
  });

  /** Returns the variables object the mutation was invoked with. */
  async function mintAndGetVariables(
    coAgentId?: string | null,
    preferredModelId?: string | null,
    configOverridesJson?: string | null
  ): Promise<Record<string, unknown>> {
    await internals(service).mintSession('target-1', 'conv-1', null, preferredModelId, null, coAgentId, configOverridesJson);
    expect(executeGQL).toHaveBeenCalledTimes(1);
    return executeGQL.mock.calls[0][1] as Record<string, unknown>;
  }

  it('threads coAgentId into the mutation variables when supplied', async () => {
    const variables = await mintAndGetVariables('co-explicit');
    expect(variables['coAgentId']).toBe('co-explicit');
    expect(variables['targetAgentId']).toBe('target-1');
  });

  it('sends coAgentId: null when omitted (server metadata drives the co-agent choice)', async () => {
    const variables = await mintAndGetVariables();
    expect(variables['coAgentId']).toBeNull();
  });

  it('declares $coAgentId in the mutation document and passes it to the field', async () => {
    await mintAndGetVariables('co-explicit');
    const mutation = executeGQL.mock.calls[0][0] as string;
    expect(mutation).toContain('$coAgentId: String');
    expect(mutation).toContain('coAgentId: $coAgentId');
  });

  it('keeps the preferredModelId passthrough intact alongside coAgentId', async () => {
    const variables = await mintAndGetVariables('co-explicit', 'model-77');
    expect(variables['preferredModelId']).toBe('model-77');
    expect(variables['coAgentId']).toBe('co-explicit');
  });

  it('threads configOverridesJson into the mutation variables when supplied', async () => {
    const overrides = '{"realtime":{"modelPreference":"model-77"}}';
    const variables = await mintAndGetVariables('co-explicit', 'model-77', overrides);
    expect(variables['configOverridesJson']).toBe(overrides);
  });

  it('sends configOverridesJson: null when omitted (server defaults — today\'s behavior)', async () => {
    const variables = await mintAndGetVariables();
    expect(variables['configOverridesJson']).toBeNull();
  });

  it('declares $configOverridesJson in the mutation document and passes it to the field', async () => {
    await mintAndGetVariables(null, null, '{"realtime":{}}');
    const mutation = executeGQL.mock.calls[0][0] as string;
    expect(mutation).toContain('$configOverridesJson: String');
    expect(mutation).toContain('configOverridesJson: $configOverridesJson');
  });
});
