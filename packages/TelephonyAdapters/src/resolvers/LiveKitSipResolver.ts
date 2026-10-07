/**
 * @fileoverview GraphQL surface for OUTBOUND telephony over LiveKit SIP: `PlaceLiveKitSipCall`.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import { TelephonyResolverContext, GetUserFromPayload, GetReadWriteProvider } from '../types.js';
import { OutboundCallRefusedError } from '../telephony/outboundCallPolicy.js';
import { GetLiveKitSipTelephonyService } from '../telephony/livekit-sip-runtime.js';

/** Result of an outbound LiveKit SIP call attempt. */
@ObjectType()
export class PlaceLiveKitSipCallResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The LiveKit room the call is in. */
    @Field(() => String)
    RoomName!: string;
}

@Resolver()
export class LiveKitSipResolver {
    /**
     * Places an outbound call over LiveKit SIP from the given agent identity to a destination number. The agent joins a new
     * room and the room dials the number, after the same outbound gate every carrier's call passes.
     */
    @Mutation(() => PlaceLiveKitSipCallResult)
    async PlaceLiveKitSipCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: TelephonyResolverContext = {},
    ): Promise<PlaceLiveKitSipCallResult> {
        const failure = (msg: string): PlaceLiveKitSipCallResult => ({ Success: false, ErrorMessage: msg, RoomName: '' });
        try {
            const user = GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetLiveKitSipTelephonyService();
            if (!service) {
                return failure('LiveKit SIP telephony is not configured on this server.');
            }
            const provider = GetReadWriteProvider(context.providers);
            if (!provider) {
                return failure('Database provider is not available.');
            }
            const roomName = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, RoomName: roomName };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (!(error instanceof OutboundCallRefusedError)) {
                LogError(`PlaceLiveKitSipCall failed: ${msg}`); // a refusal was already logged (masked) by the outbound gate
            }
            return failure(msg);
        }
    }
}
