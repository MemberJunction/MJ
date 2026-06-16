import { Resolver, Mutation, Arg, Ctx, ObjectType, InputType, Field } from 'type-graphql';
import { randomUUID } from 'crypto';
import { LogError, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { LiveKitTokenService, LiveKitAgentRoomCoordinator } from '@memberjunction/livekit-room-server';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';

/**
 * GraphQL surface for the MJ-native LiveKit room: mints scoped client access tokens and starts an
 * agent's presence in a room. The thin resolver delegates to `@memberjunction/livekit-room-server`
 * (token service + session-start coordinator) per the Transport-Layer Architecture — no LiveKit logic
 * lives here.
 *
 * `MintLiveKitClientToken` is fully functional given LiveKit credentials. `StartLiveKitAgentRoomSession`
 * additionally requires the deployment to have bound a realtime-session factory on
 * `LiveKitAgentRoomCoordinator.Instance` (the model-session creation seam); until then it returns a clear
 * error while still allowing the human to join via a minted client token.
 */

@InputType()
export class MintLiveKitClientTokenInput {
    @Field()
    RoomName: string;

    @Field({ nullable: true })
    DisplayName?: string;
}

@ObjectType()
export class LiveKitClientTokenResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field()
    ServerUrl: string;

    @Field()
    Token: string;

    @Field()
    Identity: string;

    @Field()
    RoomName: string;
}

@InputType()
export class StartLiveKitAgentRoomSessionInput {
    @Field({ nullable: true })
    AgentID?: string;

    @Field({ nullable: true })
    AgentName?: string;

    @Field({ nullable: true })
    RoomName?: string;

    @Field({ nullable: true })
    AgentSessionID?: string;

    @Field({ nullable: true })
    TurnMode?: string;
}

@ObjectType()
export class LiveKitAgentRoomSessionResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field()
    SessionBridgeID: string;

    @Field()
    RoomName: string;

    @Field()
    ServerUrl: string;

    @Field()
    ClientToken: string;

    @Field()
    Identity: string;
}

@Resolver()
export class RealtimeBridgeResolver extends ResolverBase {
    /**
     * Mints a scoped LiveKit access token for the current user to join the given room. The participant
     * identity is derived server-side from the authenticated user (never trusted from the client).
     */
    @Mutation(() => LiveKitClientTokenResult)
    async MintLiveKitClientToken(
        @Arg('input', () => MintLiveKitClientTokenInput) input: MintLiveKitClientTokenInput,
        @Ctx() context: AppContext = {} as AppContext,
    ): Promise<LiveKitClientTokenResult> {
        const failure = (msg: string): LiveKitClientTokenResult => ({
            Success: false,
            ErrorMessage: msg,
            ServerUrl: '',
            Token: '',
            Identity: '',
            RoomName: input.RoomName,
        });
        try {
            const user = this.GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const tokenService = new LiveKitTokenService();
            const minted = await tokenService.MintClientToken(
                input.RoomName,
                this.participantIdentity(user),
                input.DisplayName ?? user.Name ?? user.Email,
            );
            return { Success: true, ...minted };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`MintLiveKitClientToken failed: ${msg}`);
            return failure(msg);
        }
    }

    /**
     * Starts (or reuses) an agent's presence in a LiveKit room and returns a client token so the calling
     * user can immediately join the same room.
     */
    @Mutation(() => LiveKitAgentRoomSessionResult)
    async StartLiveKitAgentRoomSession(
        @Arg('input', () => StartLiveKitAgentRoomSessionInput) input: StartLiveKitAgentRoomSessionInput,
        @Ctx() context: AppContext = {} as AppContext,
    ): Promise<LiveKitAgentRoomSessionResult> {
        const failure = (msg: string, roomName = ''): LiveKitAgentRoomSessionResult => ({
            Success: false,
            ErrorMessage: msg,
            SessionBridgeID: '',
            RoomName: roomName,
            ServerUrl: '',
            ClientToken: '',
            Identity: '',
        });
        try {
            const user = this.GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
            const roomName = input.RoomName?.trim() || `mj-${randomUUID()}`;
            const agentSessionID = input.AgentSessionID?.trim() || randomUUID();

            const session = await LiveKitAgentRoomCoordinator.Instance.StartAgentRoomSession({
                AgentSessionID: agentSessionID,
                RoomName: roomName,
                AgentID: input.AgentID,
                AgentName: input.AgentName,
                TurnMode: this.normalizeTurnMode(input.TurnMode),
                ContextUser: user,
                MetadataProvider: provider,
            });

            const tokenService = new LiveKitTokenService();
            const clientToken = await tokenService.MintClientToken(roomName, this.participantIdentity(user), user.Name ?? user.Email);

            return {
                Success: true,
                SessionBridgeID: session.SessionBridgeID,
                RoomName: session.RoomName,
                ServerUrl: session.ServerUrl,
                ClientToken: clientToken.Token,
                Identity: clientToken.Identity,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`StartLiveKitAgentRoomSession failed: ${msg}`);
            return failure(msg, input.RoomName ?? '');
        }
    }

    /** Builds a stable, lowercased participant identity from the authenticated user. */
    private participantIdentity(user: UserInfo): string {
        return `user-${user.ID}`.toLowerCase();
    }

    /** Normalizes a turn-mode string to the bridge's accepted values. */
    private normalizeTurnMode(mode?: string): 'Passive' | 'Active' | 'Hybrid' | undefined {
        switch ((mode ?? '').toLowerCase()) {
            case 'active':
                return 'Active';
            case 'hybrid':
                return 'Hybrid';
            case 'passive':
                return 'Passive';
            default:
                return undefined;
        }
    }
}
