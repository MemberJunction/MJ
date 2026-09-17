/**
 * @fileoverview GraphQL surface for OUTBOUND RingCentral telephony: `PlaceRingCentralCall`.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { TelephonyResolverContext, getUserFromPayload, getReadWriteProvider } from '../types.js';
import { GetRingCentralTelephonyService } from '../telephony/ringcentral-runtime.js';

/** Result of an outbound RingCentral place-call attempt. */
@ObjectType()
export class PlaceRingCentralCallResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The placed RingCentral telephony session id. */
    @Field(() => String)
    SessionId!: string;
}

@Resolver()
export class RingCentralTelephonyResolver {
    /**
     * Places an outbound call from the given agent identity to a destination number.
     */
    @Mutation(() => PlaceRingCentralCallResult)
    async PlaceRingCentralCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: TelephonyResolverContext = {},
    ): Promise<PlaceRingCentralCallResult> {
        const failure = (msg: string): PlaceRingCentralCallResult => ({ Success: false, ErrorMessage: msg, SessionId: '' });
        try {
            const user = getUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetRingCentralTelephonyService();
            if (!service) {
                return failure('RingCentral telephony is not configured on this server.');
            }
            const provider = getReadWriteProvider(context.providers);
            if (!provider) {
                return failure('Database provider is not available.');
            }
            const sessionId = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, SessionId: sessionId };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PlaceRingCentralCall failed: ${msg}`);
            return failure(msg);
        }
    }
}
