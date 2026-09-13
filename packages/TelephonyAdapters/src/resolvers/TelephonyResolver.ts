/**
 * @fileoverview GraphQL surface for OUTBOUND telephony: `PlaceTwilioCall`.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { TelephonyResolverContext, getUserFromPayload, getReadWriteProvider } from '../types.js';
import { GetTwilioTelephonyService } from '../telephony/telephony-runtime.js';

/** Result of an outbound place-call attempt. */
@ObjectType()
export class PlaceCallResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The placed Twilio Call SID. */
    @Field(() => String)
    CallSid!: string;
}

@Resolver()
export class TelephonyResolver {
    /**
     * Places an outbound call from the given agent identity to a destination number.
     */
    @Mutation(() => PlaceCallResult)
    async PlaceTwilioCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: TelephonyResolverContext = {},
    ): Promise<PlaceCallResult> {
        const failure = (msg: string): PlaceCallResult => ({ Success: false, ErrorMessage: msg, CallSid: '' });
        try {
            const user = getUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetTwilioTelephonyService();
            if (!service) {
                return failure('Twilio telephony is not configured on this server.');
            }
            const provider = getReadWriteProvider(context.providers);
            if (!provider) {
                return failure('Database provider is not available.');
            }
            const callSid = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, CallSid: callSid };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PlaceTwilioCall failed: ${msg}`);
            return failure(msg);
        }
    }
}
