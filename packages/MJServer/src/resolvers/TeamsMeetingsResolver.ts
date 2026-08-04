/**
 * @fileoverview GraphQL surface for Teams meeting joins: `StartTeamsMeetingSession` has an agent identity
 * join a Teams meeting by URL and connects the pinned agent over the realtime bridge. Thin — it authorizes
 * the caller, then delegates to the startup-constructed {@link TeamsMeetingsService} (which owns the bridge
 * orchestration + the shared ACS media registry). Roster/call-ended updates arrive via the public
 * `POST /meetings/teams/notifications` Graph webhook, not GraphQL.
 *
 * Mirrors `TelephonyResolver.ts` (the Twilio `PlaceTwilioCall` equivalent).
 *
 * @module @memberjunction/server
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { GetTeamsMeetingsService } from '../telephony/teams-meetings-runtime.js';

/** Result of a Teams meeting join attempt. */
@ObjectType()
export class StartTeamsMeetingResult {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The Graph call id the bot joined (the bridge's external connection id), when successful. */
    @Field(() => String)
    CallId: string;
}

@Resolver()
export class TeamsMeetingsResolver extends ResolverBase {
    /**
     * Has the given agent identity join a Teams meeting by URL, connecting the pinned agent over the realtime
     * bridge. Returns the Graph call id.
     */
    @Mutation(() => StartTeamsMeetingResult)
    async StartTeamsMeetingSession(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('joinUrl', () => String) joinUrl: string,
        @Ctx() context: AppContext = {} as AppContext,
    ): Promise<StartTeamsMeetingResult> {
        const failure = (msg: string): StartTeamsMeetingResult => ({ Success: false, ErrorMessage: msg, CallId: '' });
        try {
            const user = this.GetUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetTeamsMeetingsService();
            if (!service) {
                return failure('Teams meetings are not configured on this server.');
            }
            const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
            const result = await service.JoinMeetingByUrl(agentIdentityId, joinUrl, user, provider);
            if (!result.accepted) {
                return failure(result.reason ?? 'The meeting join was not accepted.');
            }
            return { Success: true, CallId: result.callId ?? '' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`StartTeamsMeetingSession failed: ${msg}`);
            return failure(msg);
        }
    }
}
