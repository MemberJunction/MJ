/**
 * @fileoverview GraphQL resolver for client tool request/response communication.
 *
 * Provides:
 * - Subscription: Client subscribes to receive tool requests for a session
 * - Mutation: Client sends tool execution responses back to the server
 * - Mutation: Client sends enriched tool definitions after decoration
 *
 * @module @memberjunction/server
 */

import { Resolver, Subscription, Root, ObjectType, Field, Float, Mutation, Arg, Ctx } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogStatus, LogError } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { ClientToolRequestManager, CLIENT_TOOL_REQUEST_TOPIC, ClientToolRequestNotificationPayload } from '@memberjunction/ai-agents';

@ObjectType()
export class ClientToolRequestNotification {
    @Field()
    AgentRunID: string;

    @Field()
    SessionID: string;

    @Field()
    RequestID: string;

    @Field()
    ToolName: string;

    /** JSON-encoded parameters */
    @Field()
    Params: string;

    @Field(() => Float)
    TimeoutMs: number;

    @Field({ nullable: true })
    Description?: string;
}

@Resolver()
export class ClientToolRequestResolver extends ResolverBase {
    /**
     * Subscribe to client tool requests for a specific session.
     * The client listens on this subscription to know when an agent
     * wants to invoke a browser-side tool.
     */
    @Subscription(() => ClientToolRequestNotification, {
        topics: CLIENT_TOOL_REQUEST_TOPIC,
        filter: ({ payload, args }: { payload: ClientToolRequestNotificationPayload; args: { sessionID: string } }) => {
            return payload.SessionID === args.sessionID;
        },
    })
    ClientToolRequest(
        @Root() notification: ClientToolRequestNotificationPayload,
        @Arg('sessionID') _sessionID: string
    ): ClientToolRequestNotification {
        return {
            AgentRunID: notification.AgentRunID,
            SessionID: notification.SessionID,
            RequestID: notification.RequestID,
            ToolName: notification.ToolName,
            Params: notification.Params,
            TimeoutMs: notification.TimeoutMs,
            Description: notification.Description
        };
    }

    /**
     * Client sends the result of executing a client tool back to the server.
     * This resolves the pending Promise in ClientToolRequestManager so the
     * agent loop can continue.
     */
    @Mutation(() => Boolean)
    async RespondToClientToolRequest(
        @Arg('requestID') requestID: string,
        @Arg('success') success: boolean,
        @Arg('result', { nullable: true }) result: string | undefined,
        @Arg('errorMessage', { nullable: true }) errorMessage: string | undefined,
        @Ctx() _context: AppContext = {} as AppContext
    ): Promise<boolean> {
        try {
            const found = ClientToolRequestManager.Instance.ReceiveResponse({
                RequestID: requestID,
                Success: success,
                Result: result ? JSON.parse(result) : undefined,
                ErrorMessage: errorMessage
            });

            if (!found) {
                LogError(`RespondToClientToolRequest: no pending request for ${requestID} (may have timed out)`);
            }
            return found;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RespondToClientToolRequest error: ${msg}`);
            return false;
        }
    }

    /**
     * Client sends enriched tool definitions after running decorators.
     * The server stores them per session for LLM prompt injection.
     */
    @Mutation(() => Boolean)
    async UpdateClientToolDefinitions(
        @Arg('sessionID') sessionID: string,
        @Arg('tools') toolsJson: string,
        @Ctx() _context: AppContext = {} as AppContext
    ): Promise<boolean> {
        try {
            const tools = JSON.parse(toolsJson);
            if (!Array.isArray(tools)) {
                LogError('UpdateClientToolDefinitions: tools must be a JSON array');
                return false;
            }
            ClientToolRequestManager.Instance.SetSessionTools(sessionID, tools);
            LogStatus(`UpdateClientToolDefinitions: stored ${tools.length} tools for session ${sessionID}`);
            return true;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`UpdateClientToolDefinitions error: ${msg}`);
            return false;
        }
    }
}
