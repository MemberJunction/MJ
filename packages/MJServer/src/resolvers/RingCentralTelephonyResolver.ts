/**
 * @fileoverview GraphQL surface for OUTBOUND RingCentral telephony: `PlaceRingCentralCall` rings a real
 * phone from an agent identity and connects the pinned agent. Thin — it authorizes the caller, then
 * delegates to the startup-constructed {@link RingCentralTelephonyService} (which owns the bridge
 * orchestration + the shared media registry). Inbound calls arrive via the public
 * `POST /telephony/ringcentral/webhook` notification, not GraphQL.
 *
 * @module @memberjunction/server
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { GetRingCentralTelephonyService } from '../telephony/ringcentral-runtime.js';

/** Result of an outbound RingCentral place-call attempt. */
@ObjectType()
export class PlaceRingCentralCallResult {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The placed RingCentral telephony session id (the bridge's external connection id). */
    @Field(() => String)
    SessionId: string;
}

@Resolver()
export class RingCentralTelephonyResolver extends ResolverBase {
    /**
     * Places an outbound call from the given agent identity (its phone number is the caller-id) to a
     * destination number, connecting the pinned agent over the realtime bridge. Returns the telephony
     * session id.
     */
    @Mutation(() => PlaceRingCentralCallResult)
    async PlaceRingCentralCall(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('toNumber', () => String) toNumber: string,
        @Ctx() context: AppContext = {} as AppContext,
    ): Promise<PlaceRingCentralCallResult> {
        const failure = (msg: string): PlaceRingCentralCallResult => ({ Success: false, ErrorMessage: msg, SessionId: '' });
        try {
            const user = this.GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetRingCentralTelephonyService();
            if (!service) {
                return failure('RingCentral telephony is not configured on this server.');
            }
            const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
            const sessionId = await service.PlaceOutboundCall(agentIdentityId, toNumber, user, provider);
            return { Success: true, SessionId: sessionId };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PlaceRingCentralCall failed: ${msg}`);
            return failure(msg);
        }
    }
}
