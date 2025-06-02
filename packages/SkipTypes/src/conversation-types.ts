/**
 * @fileoverview Conversation and messaging types for Skip API
 * 
 * This file contains types related to conversations and messaging within the Skip API system.
 * These types define the structure for:
 * 
 * - Conversation data structures (SkipConversation)
 * - Individual message format (SkipMessage) 
 * - Sub-process execution results (SkipSubProcessResponse)
 * 
 * Conversations in Skip are the fundamental unit for tracking user interactions and AI responses.
 * Each conversation contains an ordered array of messages that represent the back-and-forth
 * dialogue between users and the Skip AI system. Messages can include user inputs, system
 * responses, error information, feedback, and internal processing metadata.
 * 
 * Sub-process responses are used when Skip executes code in a sandboxed environment and needs
 * to communicate the results back to the main API server.
 * 
 * @author MemberJunction
 * @since 2.0.0
 */

import type { SkipAPIArtifact } from './artifact-types';

/**
 * Whenever Skip executes it's analysis phase, it uses a sandboxed sub-process to execute code securely and
 * this shape of data is used to communicate the results of that sub-process back to the Skip API server. 
 * This data type is in turn used within the SkipAPIAnalysisCompleteResponse type.
 */
export class SkipSubProcessResponse {
    status: "success" | "error";
    /**
     * For result types of data, this is the data that was returned from the sub-process to show in the table
     */
    tableData: any[] | null; // any array of objects
    /**
     * For result type of plot, this is the data that was returned from the sub-process to show in the plot
     */
    plotData: { data: any[]; layout: any } | null; // Compatible with Plotly
    /**
     * If the request failed, this is the error message that was returned from the sub-process.
     */
    errorMessage: string | null;
}

/**
 * Defines the shape of the conversations that can be passed back and forth with the Skip API Server - primarily used for the learning cycle process
 */
export class SkipConversation {
    /**
     * The unique identifier for the conversation
     */
    id: string;
    /**
     * The user-friendly name for the conversation
     */
    name: string;
    /**
     * The unique identifier for the user that the conversation is associated with
     */
    userId?: string;
    /**
     * The name of the user that the conversation is associated with
     */
    user?: string;

    /**
     * Optional, more detailed description of the conversation
     */
    description?: string;
    
    /**
     * Array of messages that make up the conversation in chronological order, showing the earliest messages first and the more recents messages last
     */
    messages: SkipMessage[];

    /**
     * Optional, this is an array of artifacts that are associated with the conversation. The AI Agent can request to add new artifacts during a response, this array is provided by the caller to ensure that the agent 
     * knows about existing artifacts/versions
     */
    artifacts?: SkipAPIArtifact[];

    /**
     * When the conversation was created 
     */
    createdAt: Date;
    /**
     * The date the conversation header record was last updated - this is NOT the same as the most recent conversation detail, for that interrogate the conversation details
     */
    updatedAt: Date;
}

/**
 * Defines the shape of the individual message that makes up the messages array that is passed back and 
 * forth with the Skip API Server
 */
export class SkipMessage {
    /**
     * The role of the message, either "user" or "system"
     */
    role: "user" | "system";
    /**
     * The content of the message, either the user's input or the system's response
     */
    content: string;
    /**
     * The conversation detail ID for the message, used to track the message
     */
    conversationDetailID: string;

    /**
     * If the message reflects an error message the information is provided here
     */
    error?: string;

    /**
     * hiddenToUser - this is true if a message is only for internal system puprose and not shown to a user
     */
    hiddenToUser?: boolean;

    /**
     * Rating scale between 1 and 10, 1 reflecting the lowest rating and 10 reflecting the highest rating from the user in terms of their satisfaction with the response
     */
    userRating?: number;
    
    /**
     * Optional, text feedback from the user reflecting their satisfaction with the response. Of course the subsequent messages can contain this, but this is an element that the UI will
     * surface that allows a user to specifically provide feedback on each message.
     */
    userFeedback?: string;

    /**
     * Optional, this text is from Skip during the generation of a particular response and represents the step-wise reasoning Skip went through to get to a particular response. This information along with the preceding messages, User Rating and User Feedback can
     * be very helpful during a learning cycle to build notes and other artifacts that can train Skip to learn more about the user/organization's preferences and the context of the conversation.
     */
    reflectionInsights?: string;

    /**
     * Optional, this text contains an AI generated summary of the prior messages in the conversation going back in time through the last such summary. This allows "compression" of a longer conversation to preserve space in a context window, improve performance and simplify
     * inference.
     */
    summaryOfEarlierConveration?: string;

    /**
     * The date and time the message was created
     */
    createdAt?: Date;
    /**
     * The date and time the message was last updated
     */
    updatedAt?: Date;
}