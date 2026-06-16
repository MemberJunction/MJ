/**
 * @fileoverview {@link LiveKitTokenService} — mints scoped LiveKit access tokens (JWTs) server-side via
 * `livekit-server-sdk`. This is the missing browser-facing seam: the bridge already joins the *agent bot*
 * with an MJ-minted token, but a *human* participant needs their own scoped token for the same room. The
 * service mints both, encoding room + grants + role metadata, and never exposes the API secret to clients.
 *
 * Credentials resolve from explicit config or the standard `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
 * `LIVEKIT_API_SECRET` environment variables (the MJ deployment supplies them; never inline secrets).
 *
 * @module @memberjunction/livekit-room-server
 */

import { AccessToken, type VideoGrant } from 'livekit-server-sdk';

/** Resolved LiveKit server credentials + URL. */
export interface LiveKitServerConfig {
    /** The LiveKit server URL clients connect to (e.g. `wss://livekit.myorg.com`). */
    ServerUrl: string;
    /** The LiveKit API key. */
    ApiKey: string;
    /** The LiveKit API secret (server-only — never sent to clients). */
    ApiSecret: string;
}

/** The role a minted token grants, stamped into participant metadata for UI role resolution. */
export type LiveKitTokenRole = 'host' | 'agent' | 'participant';

/** Parameters for minting a single access token. */
export interface MintTokenParams {
    /** The room name the token authorizes joining. */
    RoomName: string;
    /** The participant identity to embed (stable, application-assigned). */
    Identity: string;
    /** The display name to publish. */
    DisplayName?: string;
    /** The role stamped into participant metadata (drives the UI's agent/host badges). */
    Role?: LiveKitTokenRole;
    /** Whether the participant may publish media. Default: true. */
    CanPublish?: boolean;
    /** Whether the participant may subscribe to others. Default: true. */
    CanSubscribe?: boolean;
    /** Whether the participant may publish data-channel messages. Default: true. */
    CanPublishData?: boolean;
    /** Token lifetime in seconds. Default: 3600 (1 hour). */
    TtlSeconds?: number;
    /** Extra metadata merged into the participant metadata JSON. */
    Metadata?: Record<string, unknown>;
}

/** A minted token plus the connection coordinates a client needs to join. */
export interface MintedToken {
    /** The LiveKit server URL to connect to. */
    ServerUrl: string;
    /** The signed JWT access token. */
    Token: string;
    /** The participant identity embedded in the token. */
    Identity: string;
    /** The room name the token authorizes. */
    RoomName: string;
}

/** Mints scoped LiveKit access tokens. Stateless apart from its resolved credentials. */
export class LiveKitTokenService {
    private readonly config: LiveKitServerConfig;

    /**
     * @param config Explicit credentials; any omitted field falls back to the corresponding environment
     *   variable (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
     */
    constructor(config?: Partial<LiveKitServerConfig>) {
        this.config = {
            ServerUrl: config?.ServerUrl ?? process.env.LIVEKIT_URL ?? '',
            ApiKey: config?.ApiKey ?? process.env.LIVEKIT_API_KEY ?? '',
            ApiSecret: config?.ApiSecret ?? process.env.LIVEKIT_API_SECRET ?? '',
        };
    }

    /** Whether the service has the credentials needed to mint tokens. */
    public get IsConfigured(): boolean {
        return Boolean(this.config.ServerUrl && this.config.ApiKey && this.config.ApiSecret);
    }

    /** The configured server URL (for callers that need to return it to clients). */
    public get ServerUrl(): string {
        return this.config.ServerUrl;
    }

    /**
     * Mints an access token for the given parameters.
     *
     * @param params The token parameters (room, identity, grants, role).
     * @returns The minted token + connection coordinates.
     * @throws {Error} when credentials are not configured.
     */
    public async MintToken(params: MintTokenParams): Promise<MintedToken> {
        this.assertConfigured();
        const at = new AccessToken(this.config.ApiKey, this.config.ApiSecret, {
            identity: params.Identity,
            name: params.DisplayName,
            ttl: params.TtlSeconds ?? 3600,
            metadata: this.buildMetadata(params),
        });
        at.addGrant(this.buildGrant(params));
        const token = await at.toJwt();
        return { ServerUrl: this.config.ServerUrl, Token: token, Identity: params.Identity, RoomName: params.RoomName };
    }

    /**
     * Mints a token for a HUMAN participant (publish + subscribe + data, `participant` role).
     *
     * @param roomName The room to join.
     * @param identity The participant identity.
     * @param displayName The display name.
     * @param ttlSeconds Optional token lifetime.
     */
    public MintClientToken(roomName: string, identity: string, displayName?: string, ttlSeconds?: number): Promise<MintedToken> {
        return this.MintToken({ RoomName: roomName, Identity: identity, DisplayName: displayName, Role: 'participant', TtlSeconds: ttlSeconds });
    }

    /**
     * Mints a token for the AGENT bot (publish + subscribe + data, `agent` role metadata so the UI badges
     * it correctly). The bridge passes this in its session `Configuration.AccessToken`.
     *
     * @param roomName The room to join.
     * @param identity The bot identity.
     * @param displayName The bot display name.
     */
    public MintBotToken(roomName: string, identity: string, displayName?: string): Promise<MintedToken> {
        return this.MintToken({ RoomName: roomName, Identity: identity, DisplayName: displayName, Role: 'agent' });
    }

    /** Builds the LiveKit video grant from the params (defaults: publish + subscribe + data all on). */
    private buildGrant(params: MintTokenParams): VideoGrant {
        return {
            roomJoin: true,
            room: params.RoomName,
            canPublish: params.CanPublish ?? true,
            canSubscribe: params.CanSubscribe ?? true,
            canPublishData: params.CanPublishData ?? true,
        };
    }

    /** Builds the participant metadata JSON string, always stamping the role for UI resolution. */
    private buildMetadata(params: MintTokenParams): string {
        return JSON.stringify({ mjRole: params.Role ?? 'participant', ...(params.Metadata ?? {}) });
    }

    /** Throws a clear error when credentials are missing. */
    private assertConfigured(): void {
        if (!this.IsConfigured) {
            throw new Error(
                'LiveKitTokenService is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET ' +
                    '(or pass them to the constructor) before minting tokens.',
            );
        }
    }
}
