/**
 * @fileoverview GraphQL surface for OUTBOUND telephony: `PlaceTwilioCall` rings a real phone from
 * an agent identity and connects the pinned agent. Thin — it authorizes the caller, then delegates to
 * the startup-constructed {@link TwilioTelephonyService} (which owns the bridge orchestration + the
 * shared media registry). Inbound calls arrive via the public `POST /telephony/twilio/voice` webhook,
 * not GraphQL.
 *
 * @module @memberjunction/server
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { GetTwilioTelephonyService } from '../telephony/telephony-runtime.js';

/** Result of an outbound place-call attempt. */
@ObjectType()
export class PlaceCallResult {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The placed Twilio Call SID (the bridge's external connection id). */
    @Field(() => String)
    CallSid: string;
}

@Resolver()
export class TelephonyResolver extends ResolverBase {
    /**
     * Places an outbound call from the given agent identity (its phone number is the caller-id) to a
     * destination number, connecting the pinned agent over the realtime bridge. Returns the Call SID.
     */
    @Mutation(() => PlaceCallResult)
    async PlaceTwilioCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: AppContext = {} as AppContext,
    ): Promise<PlaceCallResult> {
        const failure = (msg: string): PlaceCallResult => ({ Success: false, ErrorMessage: msg, CallSid: '' });
        try {
            const user = this.GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetTwilioTelephonyService();
            if (!service) {
                return failure('Twilio telephony is not configured on this server.');
            }
            const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
            const callSid = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, CallSid: callSid };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PlaceTwilioCall failed: ${msg}`);
            return failure(msg);
        }
    }
}
