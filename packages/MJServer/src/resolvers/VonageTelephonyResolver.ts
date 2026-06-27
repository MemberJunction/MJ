/**
 * @fileoverview GraphQL surface for OUTBOUND Vonage telephony: `PlaceVonageCall` rings a real phone from
 * an agent identity and connects the pinned agent. Thin — it authorizes the caller, then delegates to
 * the startup-constructed {@link VonageTelephonyService} (which owns the bridge orchestration + the
 * shared media registry). Inbound calls arrive via the public `POST /telephony/vonage/answer` webhook,
 * not GraphQL.
 *
 * @module @memberjunction/server
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { GetVonageTelephonyService } from '../telephony/vonage-runtime.js';

/** Result of an outbound place-call attempt. */
@ObjectType()
export class PlaceVonageCallResult {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The placed Vonage call UUID (the bridge's external connection id). */
    @Field(() => String)
    CallId: string;
}

@Resolver()
export class VonageTelephonyResolver extends ResolverBase {
    /**
     * Places an outbound call from the given agent identity (its phone number is the caller-id) to a
     * destination number, connecting the pinned agent over the realtime bridge. Returns the call UUID.
     */
    @Mutation(() => PlaceVonageCallResult)
    async PlaceVonageCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: AppContext = {} as AppContext,
    ): Promise<PlaceVonageCallResult> {
        const failure = (msg: string): PlaceVonageCallResult => ({ Success: false, ErrorMessage: msg, CallId: '' });
        try {
            const user = this.GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetVonageTelephonyService();
            if (!service) {
                return failure('Vonage telephony is not configured on this server.');
            }
            const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
            const callId = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, CallId: callId };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PlaceVonageCall failed: ${msg}`);
            return failure(msg);
        }
    }
}
