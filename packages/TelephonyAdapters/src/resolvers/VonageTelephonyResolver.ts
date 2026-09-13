/**
 * @fileoverview GraphQL surface for OUTBOUND Vonage telephony: `PlaceVonageCall`.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { TelephonyResolverContext, getUserFromPayload, getReadWriteProvider } from '../types.js';
import { GetVonageTelephonyService } from '../telephony/vonage-runtime.js';

/** Result of an outbound place-call attempt. */
@ObjectType()
export class PlaceVonageCallResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The placed Vonage call UUID. */
    @Field(() => String)
    CallId!: string;
}

@Resolver()
export class VonageTelephonyResolver {
    /**
     * Places an outbound call from the given agent identity to a destination number.
     */
    @Mutation(() => PlaceVonageCallResult)
    async PlaceVonageCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: TelephonyResolverContext = {},
    ): Promise<PlaceVonageCallResult> {
        const failure = (msg: string): PlaceVonageCallResult => ({ Success: false, ErrorMessage: msg, CallId: '' });
        try {
            const user = getUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetVonageTelephonyService();
            if (!service) {
                return failure('Vonage telephony is not configured on this server.');
            }
            const provider = getReadWriteProvider(context.providers);
            if (!provider) {
                return failure('Database provider is not available.');
            }
            const callId = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, CallId: callId };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PlaceVonageCall failed: ${msg}`);
            return failure(msg);
        }
    }
}
