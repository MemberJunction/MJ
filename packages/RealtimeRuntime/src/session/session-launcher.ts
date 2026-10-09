import type { IMetadataProvider } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import type { StartRealtimeClientSessionResult } from './RealtimeSessionRuntime';

/**
 * Everything the runtime knows when it needs a session minted — the inputs of the stock
 * `StartRealtimeClientSession` mutation, as typed values rather than a GraphQL variable bag.
 *
 * A launcher may use all, some or none of it: the default sends it to the stock mutation; a
 * host-specific launcher can map it onto its own mint (a deployment-specific mutation, a REST
 * endpoint, a guest-session exchange) so long as it returns a {@link StartRealtimeClientSessionResult}.
 */
export interface RealtimeSessionLaunchRequest {
  /** The agent the session fronts. */
  TargetAgentId: string;
  /** The conversation the session belongs to, when it continues one. */
  ConversationId: string | null;
  /** A prior session whose saved channel state this one resumes. */
  LastSessionId: string | null;
  /** A realtime model the user picked, when the host exposes a model picker. */
  PreferredModelId: string | null;
  /**
   * Client-executed tools to declare to the model at mint: the host's own plus the native tools of the
   * channels mounted with the session. A launcher that mints through its own endpoint must pass them on,
   * or the model never learns it can call them.
   */
  ClientTools: readonly RealtimeToolDefinition[];
  /** The co-agent override, or `null` to let server metadata choose. */
  CoAgentId: string | null;
  /** Session-config overrides (authorization-gated server side), as JSON. */
  ConfigOverridesJson: string | null;
  /** Whether the user consented to recording this session. */
  RecordingConsent: boolean;
  /** When the recording started (ISO), or `null` when the session is not being recorded. */
  RecordingStartedAt: string | null;
  /** A per-session media-kit collection override. */
  MediaCollectionId: string | null;
  /** The application the session runs in. */
  ApplicationId: string | null;
  /** The live app-context snapshot to inject into the companion prompt. */
  AppContext: AppContextSnapshot | null;
  /**
   * The channels this host can mount (JSON), which the server scopes against the agent's and the app's
   * configuration and answers with the resolved policy. `null` when the host brings none.
   */
  ChannelCandidatesJson: string | null;
}

/** What the runtime hands a launcher besides the request: the provider the session runs on. */
export interface RealtimeSessionLaunchContext {
  /**
   * The MJ provider this session is authenticated on. The default launcher mints through it; a custom
   * launcher that talks to MJ should do the same so the call rides the session's credential.
   */
  Provider: IMetadataProvider;
}

/**
 * How a realtime session gets MINTED — the seam between "a host wants a session" and "the server has
 * created one and handed back a token".
 *
 * The runtime owns everything either side of it (channel scoping, driver resolution, connecting,
 * transcripts, teardown). A launcher owns only the exchange. That is what lets an app change how a
 * session is minted — a guest-session exchange, a deployment-specific mutation that carries server-side
 * context the stock one cannot — without proxying the runtime's provider or re-implementing the run
 * half. Install one with {@link RealtimeSessionRuntime.Launcher}.
 *
 * A launcher must either resolve a usable result (one carrying an ephemeral token) or throw; the runtime
 * turns a throw into a failed start with the error on `LastStartError`.
 */
export interface IRealtimeSessionLauncher {
  /**
   * Mints one session.
   *
   * @param request The inputs the runtime resolved for this start.
   * @param context The provider the session runs on.
   * @returns The minted session, including `ClientPolicyJson` when the launcher's mint scoped channels and
   *   `AvatarStatusJson` when the server reports the session's avatar status.
   */
  Launch(request: RealtimeSessionLaunchRequest, context: RealtimeSessionLaunchContext): Promise<StartRealtimeClientSessionResult>;
}

/**
 * The optional extensions of the stock mint. A server that predates one rejects it at validation; the launcher then
 * mints without that one alone, so each extension falls back, and is remembered, on its own.
 */
interface MintExtensions {
  /** Scope the session's channels: the `channelCandidatesJson` argument and the `ClientPolicyJson` field. */
  ChannelScoping: boolean;
  /** The session's live-avatar status: the `AvatarStatusJson` field. */
  AvatarStatus: boolean;
}

/**
 * The extension a mint failure rejects, when the failure is a GraphQL validation rejection of one the mint asked for —
 * the signature of a server that predates it ("Unknown argument "channelCandidatesJson"…", "Cannot query field
 * "ClientPolicyJson"…", "Cannot query field "AvatarStatusJson"…"). Only that case is recoverable; any other failure is a
 * real mint failure and must surface. A rejection names one field at a time, so a server that predates both extensions
 * is found out in two steps.
 */
function unsupportedExtension(error: unknown, asked: MintExtensions): keyof MintExtensions | null {
  const message = error instanceof Error ? error.message : String(error);
  if (asked.AvatarStatus && message.includes('AvatarStatusJson')) {
    return 'AvatarStatus';
  }
  if (asked.ChannelScoping && (message.includes('channelCandidatesJson') || message.includes('ClientPolicyJson'))) {
    return 'ChannelScoping';
  }
  return null;
}

/**
 * The stock launcher: mints through the `StartRealtimeClientSession` GraphQL mutation on the session's
 * provider. This is what every host gets unless it installs another.
 *
 * When the session has channel candidates it asks the server to scope them (`channelCandidatesJson`)
 * and to return the resolved policy (`ClientPolicyJson`). It also asks for the session's live-avatar status
 * (`AvatarStatusJson`), which the call reads to say why it shows no avatar. A server that predates either
 * extension rejects it at validation, in which case the launcher mints without that extension alone (the
 * runtime then resolves the channel scope locally, or shows no avatar notice) — a new client must keep
 * working against an older server, and a failed mint over an optional extension would be the worst way to
 * find out they differ. Each fallback is remembered per launcher instance so a long-lived runtime asks once.
 */
export class DefaultRealtimeSessionLauncher implements IRealtimeSessionLauncher {
  /** Whether the server rejected the channel-scoping extension of the mint; set once and kept. */
  private serverLacksChannelScoping = false;
  /** Whether the server rejected the avatar-status field of the mint; set once and kept. */
  private serverLacksAvatarStatus = false;

  public async Launch(request: RealtimeSessionLaunchRequest, context: RealtimeSessionLaunchContext): Promise<StartRealtimeClientSessionResult> {
    // The session's provider is the GraphQL one in every shipped host; this is the same narrowing the runtime applies for its relay mutations.
    const transport = context.Provider as GraphQLDataProvider;
    const result = await this.executeMintMutation(transport, this.buildVariables(request), request.ChannelCandidatesJson);
    const payload = result?.StartRealtimeClientSession as StartRealtimeClientSessionResult | undefined;
    if (!payload?.EphemeralToken) {
      throw new Error('StartRealtimeClientSession returned no ephemeral token');
    }
    return payload;
  }

  /** The mutation's variables for one request. */
  private buildVariables(request: RealtimeSessionLaunchRequest): Record<string, JSONValue> {
    return {
      targetAgentId: request.TargetAgentId,
      conversationId: request.ConversationId,
      lastSessionId: request.LastSessionId,
      preferredModelId: request.PreferredModelId,
      clientToolsJson: request.ClientTools.length > 0 ? JSON.stringify(request.ClientTools) : null,
      coAgentId: request.CoAgentId,
      configOverridesJson: request.ConfigOverridesJson,
      recordingConsent: request.RecordingConsent,
      recordingStartedAt: request.RecordingStartedAt,
      mediaCollectionId: request.MediaCollectionId,
      applicationId: request.ApplicationId,
      appContextJson: request.AppContext ? JSON.stringify(request.AppContext) : null
    };
  }

  /**
   * Runs the mint with every extension this server has not rejected, dropping one at a time when the server rejects it
   * at validation. Each retry asks for one extension fewer, so the loop ends.
   */
  private async executeMintMutation(
    transport: GraphQLDataProvider,
    variables: Record<string, JSONValue>,
    channelCandidatesJson: string | null
  ): Promise<{ StartRealtimeClientSession?: StartRealtimeClientSessionResult } | undefined> {
    let asked: MintExtensions = {
      ChannelScoping: channelCandidatesJson !== null && !this.serverLacksChannelScoping,
      AvatarStatus: !this.serverLacksAvatarStatus,
    };
    for (;;) {
      try {
        const mintVariables = asked.ChannelScoping ? { ...variables, channelCandidatesJson } : variables;
        return await transport.ExecuteGQL(this.buildMintMutation(asked), mintVariables);
      } catch (error) {
        const unsupported = unsupportedExtension(error, asked);
        if (!unsupported) {
          throw error;
        }
        this.rememberUnsupported(unsupported);
        asked = { ...asked, [unsupported]: false };
      }
    }
  }

  /** Remembers that the server lacks an extension of the mint, and says so once. */
  private rememberUnsupported(extension: keyof MintExtensions): void {
    if (extension === 'ChannelScoping') {
      console.warn('[RealtimeSession] The server does not support channel scoping — minting without it and resolving channels locally.');
      this.serverLacksChannelScoping = true;
      return;
    }
    console.warn('[RealtimeSession] The server does not report the avatar status — minting without it; the call shows no avatar notice.');
    this.serverLacksAvatarStatus = true;
  }

  /** The `StartRealtimeClientSession` document, with the extensions asked for. */
  private buildMintMutation(asked: MintExtensions): string {
    const extraVariable = asked.ChannelScoping ? ', $channelCandidatesJson: String' : '';
    const extraArgument = asked.ChannelScoping ? ', channelCandidatesJson: $channelCandidatesJson' : '';
    const extraField = [asked.ChannelScoping ? 'ClientPolicyJson' : '', asked.AvatarStatus ? 'AvatarStatusJson' : '']
      .filter((field) => field.length > 0)
      .map((field) => `\n          ${field}`)
      .join('');
    return `
      mutation StartRealtimeClientSession($targetAgentId: String!, $conversationId: String, $lastSessionId: String, $preferredModelId: String, $clientToolsJson: String, $coAgentId: String, $configOverridesJson: String, $recordingConsent: Boolean, $recordingStartedAt: String, $mediaCollectionId: String, $applicationId: String, $appContextJson: String${extraVariable}) {
        StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId, lastSessionId: $lastSessionId, preferredModelId: $preferredModelId, clientToolsJson: $clientToolsJson, coAgentId: $coAgentId, configOverridesJson: $configOverridesJson, recordingConsent: $recordingConsent, recordingStartedAt: $recordingStartedAt, mediaCollectionId: $mediaCollectionId, applicationId: $applicationId, appContextJson: $appContextJson${extraArgument}) {
          AgentSessionId
          ConversationId
          Provider
          Model
          EphemeralToken
          ExpiresAt
          SessionConfigJson
          ModelName
          NarrationInstructionsTemplate
          PriorChannelStatesJson${extraField}
        }
      }
    `;
  }
}
