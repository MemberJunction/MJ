/**
 * @fileoverview GraphQL surface for Teams meeting joins: `StartTeamsMeetingSession`.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { LogError, IMetadataProvider } from '@memberjunction/core';
import { TelephonyResolverContext, getUserFromPayload, getReadWriteProvider } from '../types.js';
import { GetTeamsMeetingsService } from '../telephony/teams-meetings-runtime.js';

/** Result of a Teams meeting join attempt. */
@ObjectType()
export class StartTeamsMeetingResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** The Graph call id the bot joined (the bridge's external connection id), when successful. */
    @Field(() => String)
    CallId!: string;
}

@Resolver()
export class TeamsMeetingsResolver {
    /**
     * Has the given agent identity join a Teams meeting by URL, connecting the pinned agent over the realtime
     * bridge. Returns the Graph call id.
     */
    @Mutation(() => StartTeamsMeetingResult)
    async StartTeamsMeetingSession(
        @Arg('agentIdentityId', () => String) agentIdentityId: string,
        @Arg('joinUrl', () => String) joinUrl: string,
        @Ctx() context: TelephonyResolverContext = {},
    ): Promise<StartTeamsMeetingResult> {
        const failure = (msg: string): StartTeamsMeetingResult => ({ Success: false, ErrorMessage: msg, CallId: '' });
        try {
            const user = getUserFromPayload(context.userPayload);
            if (!user) {
                return failure('Unable to determine current user.');
            }
            const service = GetTeamsMeetingsService();
            if (!service) {
                return failure('Teams meetings are not configured on this server.');
            }
            const provider = getReadWriteProvider(context.providers);
            if (!provider) {
                return failure('Database provider is not available.');
            }
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
