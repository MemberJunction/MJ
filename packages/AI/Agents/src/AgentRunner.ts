/**
 * @fileoverview AgentRunner provides a thin wrapper for executing AI agents
 * using the MemberJunction AI Agent framework.
 * 
 * This module handles agent instantiation using the ClassFactory pattern to ensure
 * the correct agent subclass is used based on the agent type's DriverClass property.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { createHash } from 'crypto';
import { LogError, LogStatusEx, IsVerboseLoggingEnabled, LogStatus, Metadata, RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ExecuteAgentResult, ExecuteAgentParams, MediaOutput, FileOutputRef } from '@memberjunction/ai-core-plus';
import { BaseAgent } from './base-agent';
import { MJConversationEntity, MJConversationDetailEntity, MJArtifactEntity, MJArtifactVersionEntity, MJConversationDetailArtifactEntity, MJAIAgentRunMediaEntity, MJConversationDetailAttachmentEntity, MJFileEntity, ArtifactMetadataEngine, FileStorageEngine, StorageAccountWithProvider } from '@memberjunction/core-entities';
import { initializeDriverWithAccountCredentials } from '@memberjunction/storage';

// ── Types used only by the historical reprocessing path ──────────────────────

/** Typed shape of a single action output parameter stored in step OutputData */
interface ActionOutputParam {
    Name: string;
    Type: string;
    Value: unknown;
}

/** Typed shape of the OutputData JSON written by base-agent for action steps */
interface ActionStepOutputData {
    actionResult?: {
        parameters?: ActionOutputParam[];
    };
}

/** Minimal read-only shape loaded from MJ: AI Agent Run Steps for reprocessing */
interface ActionStepSummary {
    ID: string;
    OutputData: string | null;
}

/**
 * AgentRunner provides a thin wrapper for executing AI agents.
 * 
 * This class handles:
 * - Loading agent type metadata to get the DriverClass
 * - Instantiating the correct agent class using ClassFactory
 * - Passing through to the agent's Execute method
 * 
 * @class AgentRunner
 * @example
 * ```typescript
 * const runner = new AgentRunner();
 * const result = await runner.RunAgent({
 *   agent: myAgent,
 *   conversationMessages: messages,
 *   contextUser: currentUser
 * });
 * ```
 */
export class AgentRunner {
    private readonly _provider: IMetadataProvider;

    constructor(provider?: IMetadataProvider) {
        this._provider = provider || Metadata.Provider;
    }

    /**
     * Runs an AI agent with the specified parameters.
     * 
     * This method acts as a thin pass-through that:
     * 1. Loads the agent type to get the DriverClass
     * 2. Uses ClassFactory to instantiate the correct agent class
     * 3. Calls Execute on the agent instance and returns the result
     * 
     * @param {ExecuteAgentParams} params - Parameters for agent execution (same as BaseAgent.Execute)
     * @template C - The type of the agent's context as provided in the ExecuteAgentParams 
     * @template R - The type of the agent's result as returned in ExecuteAgentResult
     * @returns {Promise<ExecuteAgentResult<T>>} The execution result (same as BaseAgent.Execute)
     * 
     * @throws {Error} Throws if agent type loading fails or agent instantiation fails
     */
    public async RunAgent<C = any, R = any>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        try {
            LogStatusEx({
                message: `AgentRunner: Starting execution for agent: ${params.agent.Name} (ID: ${params.agent.ID})`,
                verboseOnly: true,
                isVerboseEnabled: () => params.verbose === true || IsVerboseLoggingEnabled()
            });
            
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, params.contextUser);
            
            // Find the agent type to get the DriverClass
            const agentType = AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, params.agent.TypeID));
            if (!agentType) {
                throw new Error(`Agent type not found for ID: ${params.agent.TypeID}`);
            }
            
            // Get the correct agent class using ClassFactory, prefer the agent's DriverClass if specified, otherwise fallback to Agent Type, otherwise we get BaseAgent from ClassFactory
            const driverClass = params.agent.DriverClass || agentType.DriverClass;
            LogStatusEx({
                message: `AgentRunner: Using driver class: ${driverClass}`,
                verboseOnly: true,
                isVerboseEnabled: () => params.verbose === true || IsVerboseLoggingEnabled()
            });
            
            const agentInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(
                BaseAgent,
                driverClass
            );
            
            if (!agentInstance) {
                throw new Error(`Failed to create agent instance for driver class: ${driverClass}`);
            }
            
            // Execute the agent and return the result directly, threading the isolated provider.
            // Favor provider already in params (caller-supplied) over the instance-level provider.
            return await agentInstance.Execute({ ...params, provider: params.provider || this._provider } as ExecuteAgentParams<any>) as ExecuteAgentResult<R>;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            LogError(`AgentRunner execution failed: ${errorMessage}`, undefined, error);
            
            // Re-throw the error since we can't create a proper ExecuteAgentResult without an agent run
            // BaseAgent.Execute will handle creating a proper error result with an agent run
            throw error;
        }
    }

    /**
     * Runs an AI agent within a conversation context, handling conversation and artifact management.
     *
     * This method provides a complete workflow for running agents in conversations:
     * 1. Creates or uses existing conversation
     * 2. Creates conversation detail record for the user message
     * 3. Executes the agent
     * 4. Creates artifacts from the agent's payload (if configured)
     * 5. Links artifacts to the conversation detail
     *
     * @param params - Core agent execution parameters
     * @param options - Conversation-specific options
     * @returns Promise containing the agent execution result and conversation/artifact metadata
     *
     * @example
     * ```typescript
     * const runner = new AgentRunner();
     * const result = await runner.RunAgentInConversation({
     *   agent: myAgent,
     *   conversationMessages: messages,
     *   contextUser: currentUser
     * }, {
     *   conversationId: existingConvoId,  // Optional - creates new if not provided
     *   userMessage: 'User query text',
     *   createArtifacts: true
     * });
     * ```
     */
    public async RunAgentInConversation<C = any, R = any>(
        params: ExecuteAgentParams<C>,
        options: {
            /** Optional existing conversation ID. If not provided, a new conversation will be created */
            conversationId?: string;
            /** Optional existing conversation detail ID. If provided, skips conversation/detail creation */
            conversationDetailId?: string;
            /** The user's message text for this conversation turn (required if conversationDetailId not provided) */
            userMessage?: string;
            /** Whether to create artifacts from the agent's payload (default: true) */
            createArtifacts?: boolean;
            /** Optional source artifact ID for versioning (agent continuity/refinement) */
            sourceArtifactId?: string;
            /** Optional conversation name (only used when creating new conversation) */
            conversationName?: string;
            /** Optional test run ID to link conversation and details to (for test execution traceability) */
            testRunId?: string;
        }
    ): Promise<{
        /** The agent execution result */
        agentResult: ExecuteAgentResult<R>;
        /** The conversation ID (created or existing) */
        conversationId: string;
        /** The conversation detail ID for the user message */
        userMessageDetailId: string;
        /** The conversation detail ID for the agent response (only present if server created it) */
        agentResponseDetailId?: string;
        /** Artifact information if created */
        artifactInfo?: {
            artifactId: string;
            versionId: string;
            versionNumber: number;
        };
    }> {
        const md = params.provider || this._provider;
        const contextUser = params.contextUser;

        if (!contextUser) {
            throw new Error('contextUser is required for RunAgentInConversation');
        }

        try {
            let conversationId: string;
            let userMessageDetailId: string;
            let agentResponseDetailId: string | undefined;
            let agentResponseDetail: MJConversationDetailEntity | undefined;

            // If conversationDetailId is provided, use it (UI-created agent response detail)
            if (options.conversationDetailId) {
                agentResponseDetailId = options.conversationDetailId;

                // LATENCY OPTIMIZATION (Opt #2): When conversationId is pre-resolved by the caller
                // (e.g., the resolver already loaded the ConversationDetail to build history), we
                // skip the redundant DB load that was ONLY needed to extract ConversationID.
                //
                // We still must load the ConversationDetail entity object because it serves double
                // duty: (a) progress callback updates its Message field during execution, and
                // (b) step 5 sets the final Status/Message/ResponseForm after the agent completes.
                // What we save here is the serial dependency: previously we had to wait for the
                // Load to complete before we even knew conversationId. Now we know conversationId
                // immediately and can resolve the entity object's load in parallel with other setup.
                if (options.conversationId) {
                    conversationId = options.conversationId;
                    LogStatus(`Using pre-resolved conversation ${conversationId} and agent response detail ${agentResponseDetailId}`);
                } else {
                    // Fallback for callers that don't provide conversationId (backward compatibility).
                    // This path still works but incurs the extra DB round-trip to extract conversationId.
                    const tempDetail = await md.GetEntityObject<MJConversationDetailEntity>(
                        'MJ: Conversation Details',
                        contextUser
                    );
                    if (await tempDetail.Load(agentResponseDetailId)) {
                        conversationId = tempDetail.ConversationID;
                        LogStatus(`Using existing conversation ${conversationId} and agent response detail ${agentResponseDetailId}`);
                    } else {
                        throw new Error(`Failed to load conversation detail ${agentResponseDetailId}`);
                    }
                }

                // Load the entity object for progress updates and final status Save at step 5.
                // This is needed regardless of whether conversationId was pre-resolved.
                agentResponseDetail = await md.GetEntityObject<MJConversationDetailEntity>(
                    'MJ: Conversation Details',
                    contextUser
                );
                if (!await agentResponseDetail.Load(agentResponseDetailId)) {
                    throw new Error(`Failed to load conversation detail entity for status updates: ${agentResponseDetailId}`);
                }

                userMessageDetailId = agentResponseDetailId; // For backward compatibility
            } else {
                // Server creates BOTH user message and agent response details
                if (!options.userMessage) {
                    throw new Error('userMessage is required when conversationDetailId is not provided');
                }

                // Step 1: Get or create conversation
                conversationId = options.conversationId || '';

                if (!conversationId) {
                    LogStatus('Creating new conversation');
                    const conversation = await md.GetEntityObject<MJConversationEntity>(
                        'MJ: Conversations',
                        contextUser
                    );

                    // Smart conversation naming:
                    // 1. Use provided name if given
                    // 2. Otherwise, use AI prompt to generate a good name from user message
                    // 3. Fallback to "Chat with [AgentName]"
                    let conversationName = options.conversationName;
                    let conversationDescription: string | null = null;

                    if (!conversationName && options.userMessage) {
                        // Try to generate a name using the "Name Conversation" prompt (same as UI)
                        const nameResult = await this.GenerateConversationName(options.userMessage, contextUser, md);
                        if (nameResult) {
                            conversationName = nameResult.name;
                            conversationDescription = nameResult.description;
                        }
                    }

                    if (!conversationName) {
                        conversationName = `Chat with ${params.agent.Name}`;
                    }

                    conversation.Name = conversationName;
                    conversation.Description = conversationDescription || ''; // Set description too (like UI does)
                    conversation.UserID = contextUser.ID;
                    conversation.Status = 'Available';
                    conversation.DataContextID = null; // Can be set by caller if needed

                    // Link to test run if provided (for test execution traceability)
                    if (options.testRunId) {
                        conversation.TestRunID = options.testRunId;
                    }

                    if (!(await conversation.Save())) {
                        throw new Error('Failed to create conversation');
                    }

                    conversationId = conversation.ID;
                    LogStatus(`Created conversation ${conversationId}: ${conversationName}`);
                }

                // Step 2: Create conversation detail for user message
                LogStatus('Creating conversation detail for user message');
                const userMessageDetail = await md.GetEntityObject<MJConversationDetailEntity>(
                    'MJ: Conversation Details',
                    contextUser
                );

                userMessageDetail.ConversationID = conversationId;
                userMessageDetail.Message = options.userMessage;
                userMessageDetail.Role = 'User';
                userMessageDetail.UserID = contextUser.ID;
                userMessageDetail.HiddenToUser = false;

                // Link to test run if provided (for test execution traceability)
                if (options.testRunId) {
                    userMessageDetail.TestRunID = options.testRunId;
                }

                if (!(await userMessageDetail.Save())) {
                    throw new Error('Failed to create user message conversation detail');
                }

                userMessageDetailId = userMessageDetail.ID;
                LogStatus(`Created user message detail ${userMessageDetailId}`);

                // Step 3: Create conversation detail for agent response (like UI does)
                LogStatus('Creating conversation detail for agent response');
                agentResponseDetail = await md.GetEntityObject<MJConversationDetailEntity>(
                    'MJ: Conversation Details',
                    contextUser
                );

                agentResponseDetail.ConversationID = conversationId;
                agentResponseDetail.Message = '⏳ Starting...';
                agentResponseDetail.Role = 'AI';
                agentResponseDetail.Status = 'In-Progress';
                agentResponseDetail.HiddenToUser = false;
                agentResponseDetail.AgentID = params.agent.ID;

                // Link to test run if provided (for test execution traceability)
                if (options.testRunId) {
                    agentResponseDetail.TestRunID = options.testRunId;
                }

                if (!(await agentResponseDetail.Save())) {
                    throw new Error('Failed to create agent response conversation detail');
                }

                agentResponseDetailId = agentResponseDetail.ID;
                LogStatus(`Created agent response detail ${agentResponseDetailId}`);
            }

            // Step 4: Execute the agent with conversation context
            LogStatus(`Executing agent ${params.agent.Name} in conversation context`);

            // Flag to prevent late progress callbacks from overwriting final status
            // Progress callbacks fire async and may complete AFTER agent returns
            let agentExecutionCompleted = false;

            // Wrap progress callback to update agent response detail
            const originalOnProgress = params.onProgress;
            const wrappedOnProgress = agentResponseDetail
                ? async (progress: any) => {
                    // Skip DB save if agent already completed - prevents race condition
                    // where late progress overwrites final Status='Complete'
                    if (agentExecutionCompleted) {
                        // Still call original callback for PubSub streaming
                        if (originalOnProgress) {
                            await originalOnProgress(progress);
                        }
                        return;
                    }

                    // Update the agent response detail with progress message
                    if (agentResponseDetail && progress.message) {
                        agentResponseDetail.Message = progress.message;
                        await agentResponseDetail.Save();
                    }
                    // Call original callback if provided
                    if (originalOnProgress) {
                        await originalOnProgress(progress);
                    }
                }
                : originalOnProgress;

            const modifiedParams: ExecuteAgentParams<C> = {
                ...params,
                data: {...params.data, conversationId}, // ensure we pass along OUR conversationId
                conversationDetailId: agentResponseDetailId,
                onProgress: wrappedOnProgress
            };

            const agentResult = await this.RunAgent<C, R>(modifiedParams);

            // Mark execution as completed to stop progress saves
            agentExecutionCompleted = true;

            // LATENCY OPTIMIZATION (Opt #5): Steps 5, 6, and 7 are now parallelized.
            //
            // Previously these ran sequentially: save final status → process artifacts → save media.
            // This added their individual latencies together (~130ms for steps 6+7, plus ~80ms for
            // step 5's EnsureSaveComplete + Load + Save cycle).
            //
            // These operations are safe to parallelize because:
            // - Step 5 (status update) writes to the ConversationDetail record (Status, Message fields)
            // - Step 6 (artifacts) creates new Artifact/ArtifactVersion records and a junction record
            //   linking to the ConversationDetail — it only needs the agentResponseDetailId (string),
            //   not the entity object, and doesn't read/write the same fields as step 5
            // - Step 7 (media) creates new AIAgentRunMedia and ConversationDetailAttachment records —
            //   entirely separate from steps 5 and 6
            //
            // IMPORTANT: All three MUST complete before the resolver publishes the 'complete' event,
            // because the client reloads all conversation data from the DB when it receives that event.
            // If any write hasn't flushed yet, the client would see stale data. Promise.all guarantees
            // all three finish before we return.

            // Step 5: Update agent response detail with final result (async)
            const updateDetailPromise = (async () => {
                if (agentResponseDetail && agentResponseDetailId) {
                    // Wait for any in-flight progress save to complete
                    // EnsureSaveComplete() resolves immediately if no save in progress
                    await agentResponseDetail.EnsureSaveComplete();

                    LogStatus('Updating agent response detail with final result');

                    // Reload to get any updates from agent execution
                    await agentResponseDetail.Load(agentResponseDetailId);

                    agentResponseDetail.Message = agentResult.agentRun?.Message ||
                                                 (agentResult.success
                                                     ? '✅ Completed'
                                                     : agentResult.agentRun?.ErrorMessage || '❌ Failed');
                    agentResponseDetail.Status = agentResult.success ? 'Complete' : 'Error';

                    // Set response form and command fields
                    if (agentResult.responseForm) {
                        agentResponseDetail.ResponseForm = JSON.stringify(agentResult.responseForm);
                    }
                    if (agentResult.actionableCommands && agentResult.actionableCommands.length > 0) {
                        agentResponseDetail.ActionableCommands = JSON.stringify(agentResult.actionableCommands);
                    }
                    if (agentResult.automaticCommands && agentResult.automaticCommands.length > 0) {
                        agentResponseDetail.AutomaticCommands = JSON.stringify(agentResult.automaticCommands);
                    }

                    await agentResponseDetail.Save();
                    LogStatus(`Updated agent response detail ${agentResponseDetailId} with final status: ${agentResponseDetail.Status}`);
                }
            })();

            // Step 6: Process artifacts if requested and agent succeeded (async)
            const processArtifactsPromise = (async () => {
                const shouldCreateArtifacts = options.createArtifacts !== false; // Default true
                if (shouldCreateArtifacts && agentResult.success && agentResult.payload) {
                    return this.ProcessAgentArtifacts(
                        agentResult,
                        agentResponseDetailId!,
                        options.sourceArtifactId,
                        contextUser,
                        md
                    );
                }
                return undefined;
            })();

            // Step 6b: Process file artifacts produced by file-generation actions (async)
            const processFileArtifactsPromise = (async () => {
                if (agentResult.success && agentResponseDetailId && agentResult.fileOutputs?.length) {
                    await this.ProcessFileArtifacts(
                        agentResult.fileOutputs,
                        agentResponseDetailId,
                        contextUser,
                        agentResult.resolvedStorageAccountId
                    );
                }
            })();

            // Step 7: Save media outputs to AIAgentRunMedia and create conversation attachments (async)
            const saveMediaPromise = (async () => {
                if (agentResult.mediaOutputs && agentResult.mediaOutputs.length > 0) {
                    const mediaToSave = agentResult.mediaOutputs.filter(m => m.persist !== false);
                    LogStatus(`Processing ${mediaToSave.length} of ${agentResult.mediaOutputs.length} media outputs (filtered by persist flag)`);

                    // Save to AIAgentRunMedia for permanent storage
                    const ids = await this.SaveAgentRunMedia(
                        agentResult.agentRun.ID,
                        mediaToSave,
                        contextUser,
                        md
                    );

                    // Create ConversationDetailAttachment records for UI display
                    if (agentResponseDetailId && ids.length > 0) {
                        await this.CreateConversationMediaAttachments(
                            agentResponseDetailId,
                            mediaToSave,
                            ids,
                            contextUser,
                            md
                        );
                    }
                    return ids;
                }
                return [];
            })();

            // Wait for all three post-execution operations to complete before returning.
            // The resolver publishes the 'complete' event after this returns, so the client
            // is guaranteed to see all DB writes when it reloads.
            const [, artifactInfo] = await Promise.all([
                updateDetailPromise,
                processArtifactsPromise,
                processFileArtifactsPromise,
                saveMediaPromise
            ]);

            return {
                agentResult,
                conversationId,
                userMessageDetailId,
                agentResponseDetailId,
                artifactInfo
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            LogError(`RunAgentInConversation failed: ${errorMessage}`, undefined, error);
            throw error;
        }
    }

    /**
     * Gets the maximum version number for an artifact.
     * Used when creating new versions of explicitly specified artifacts.
     *
     * @param artifactId - The artifact ID to query
     * @param contextUser - The user context for the query
     * @returns The maximum version number, or 0 if no versions exist
     *
     * @example
     * ```typescript
     * const runner = new AgentRunner();
     * const maxVersion = await runner.GetMaxVersionForArtifact(artifactId, currentUser);
     * const newVersionNumber = maxVersion + 1;
     * ```
     */
    public async GetMaxVersionForArtifact(artifactId: string, contextUser: UserInfo): Promise<number> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJArtifactVersionEntity>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${artifactId}'`,
                OrderBy: 'VersionNumber DESC',
                MaxRows: 1,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0].VersionNumber || 0;
            }

            return 0;
        } catch (error) {
            LogError(`Error getting max version for artifact: ${(error as Error).message}`);
            return 0;
        }
    }

    /**
     * Checks whether the serialized content for a new artifact version is identical to the
     * latest existing version of the same artifact, using SHA-256 content hashing.
     *
     * When the content is unchanged, creating a new version adds noise without value.
     * This method computes the hash of the candidate content and compares it against
     * the `ContentHash` stored on the most recent version (populated by
     * `MJArtifactVersionEntityServer.Save()`).
     *
     * @param artifactId - The artifact whose latest version to compare against
     * @param candidateContent - The serialized (JSON-stringified) content that would become the new version
     * @param latestVersionNumber - The version number of the current latest version
     * @param contextUser - User context for the RunView query
     * @returns The existing version's ID if content is identical, or `null` if a new version should be created
     */
    protected async CheckForDuplicateVersion(
        artifactId: string,
        candidateContent: string,
        latestVersionNumber: number,
        contextUser: UserInfo
    ): Promise<string | null> {
        const candidateHash = createHash('sha256').update(candidateContent, 'utf8').digest('hex');

        const rv = new RunView();
        const result = await rv.RunView<{ ID: string; ContentHash: string }>({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${artifactId}' AND VersionNumber=${latestVersionNumber}`,
            Fields: ['ID', 'ContentHash'],
            MaxRows: 1,
            ResultType: 'simple'
        }, contextUser);

        if (result.Success && result.Results.length > 0 && result.Results[0].ContentHash === candidateHash) {
            return result.Results[0].ID;
        }

        return null;
    }

    /**
     * Creates a `ConversationDetailArtifact` junction record linking an artifact version
     * to a conversation detail, then returns the standard artifact result tuple.
     *
     * Extracted as a helper so both the normal version-creation path and the
     * duplicate-skip path can share the same linking and return logic.
     *
     * @param versionId - The artifact version ID to link
     * @param conversationDetailId - The conversation detail to link to
     * @param artifactId - The parent artifact ID (passed through to the return value)
     * @param versionNumber - The version number (passed through to the return value)
     * @param contextUser - User context for the save operation
     * @param provider - Metadata provider for entity creation
     * @returns The standard artifact result tuple
     */
    protected async LinkArtifactToConversationDetail(
        versionId: string,
        conversationDetailId: string,
        artifactId: string,
        versionNumber: number,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<{ artifactId: string; versionId: string; versionNumber: number }> {
        const junction = await provider.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            contextUser
        );
        junction.ConversationDetailID = conversationDetailId;
        junction.ArtifactVersionID = versionId;
        junction.Direction = 'Output';

        if (!(await junction.Save())) {
            throw new Error('Failed to create artifact-message association');
        }

        LogStatus(`Linked artifact to conversation detail ${conversationDetailId}`);

        return { artifactId, versionId, versionNumber };
    }

    /**
     * Finds the most recent artifact for a conversation detail to determine versioning.
     * Queries the junction table to locate artifacts linked to a specific conversation message.
     *
     * @param conversationDetailId - The conversation detail ID to query
     * @param contextUser - The user context for the query
     * @returns Artifact info if exists, null if this is the first artifact for this message
     *
     * @example
     * ```typescript
     * const runner = new AgentRunner();
     * const previousArtifact = await runner.FindPreviousArtifactForMessage(detailId, currentUser);
     * if (previousArtifact) {
     *     console.log(`Found artifact ${previousArtifact.artifactId} at version ${previousArtifact.versionNumber}`);
     * }
     * ```
     */
    public async FindPreviousArtifactForMessage(
        conversationDetailId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<{ artifactId: string; versionNumber: number } | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJConversationDetailArtifactEntity>({
                EntityName: 'MJ: Conversation Detail Artifacts',
                ExtraFilter: `ConversationDetailID='${conversationDetailId}' AND Direction='Output'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            const junction = result.Results[0];
            const md = provider || this._provider;
            const version = await md.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                contextUser
            );

            if (!(await version.Load(junction.ArtifactVersionID))) {
                return null;
            }

            return {
                artifactId: version.ArtifactID,
                versionNumber: version.VersionNumber
            };
        } catch (error) {
            LogError(`Error finding previous artifact: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Processes agent completion to create artifacts from the agent's payload.
     * Handles artifact creation, versioning, and linking to conversation details.
     *
     * This method implements intelligent artifact versioning:
     * 1. If sourceArtifactId is provided (explicit continuity), creates new version of that artifact
     * 2. Otherwise, checks for previous artifacts on this conversation detail
     * 3. If previous artifact exists, creates new version of it
     * 4. If no previous artifact, creates entirely new artifact
     *
     * Respects the agent's ArtifactCreationMode configuration:
     * - "Never": Skips artifact creation entirely
     * - "System Only": Creates artifact with Visibility='System Only'
     * - Other modes: Creates artifact with Visibility='Always'
     *
     * @param agentResult - The result from agent execution containing the payload
     * @param conversationDetailId - The conversation detail to link the artifact to
     * @param sourceArtifactId - Optional explicit artifact to version from (agent continuity)
     * @param contextUser - The user context for the operation
     * @returns Artifact metadata if created, undefined if skipped or failed
     *
     * @example
     * ```typescript
     * const runner = new AgentRunner();
     * const artifactInfo = await runner.ProcessAgentArtifacts(
     *     agentResult,
     *     conversationDetailId,
     *     sourceArtifactId, // Optional
     *     currentUser
     * );
     * if (artifactInfo) {
     *     console.log(`Created artifact ${artifactInfo.artifactId} version ${artifactInfo.versionNumber}`);
     * }
     * ```
     */
    public async ProcessAgentArtifacts<R>(
        agentResult: ExecuteAgentResult<R>,
        conversationDetailId: string,
        sourceArtifactId: string | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<{ artifactId: string; versionId: string; versionNumber: number } | undefined> {
        const payload = agentResult.payload;
        const agentRun = agentResult.agentRun;

        if (!payload || Object.keys(payload).length === 0) {
            LogStatus('No payload to create artifact from');
            return undefined;
        }

        // Check agent's ArtifactCreationMode
        await AIEngine.Instance.Config(false, contextUser);
        const agent = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, agentRun.AgentID));
        const creationMode = agent?.ArtifactCreationMode;

        if (creationMode === 'Never') {
            LogStatus(`Skipping artifact creation - agent "${agent?.Name}" has ArtifactCreationMode='Never'`);
            return undefined;
        }

        try {
            const md = provider || this._provider;
            const JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';

            // Determine if creating new artifact or new version
            let artifactId: string;
            let newVersionNumber: number;
            let isNewArtifact = false;

            // Priority 1: Use explicit source artifact if provided
            if (sourceArtifactId) {
                const maxVersion = await this.GetMaxVersionForArtifact(sourceArtifactId, contextUser);
                artifactId = sourceArtifactId;
                newVersionNumber = maxVersion + 1;
                LogStatus(`Creating version ${newVersionNumber} of source artifact ${artifactId}`);
            }
            // Priority 2: Try to find previous artifact for this message
            else {
                const previousArtifact = await this.FindPreviousArtifactForMessage(
                    conversationDetailId,
                    contextUser,
                    md
                );

                if (previousArtifact) {
                    artifactId = previousArtifact.artifactId;
                    newVersionNumber = previousArtifact.versionNumber + 1;
                    LogStatus(`Creating version ${newVersionNumber} of existing artifact ${artifactId}`);
                } else {
                    // Create new artifact header
                    const artifact = await md.GetEntityObject<MJArtifactEntity>(
                        'MJ: Artifacts',
                        contextUser
                    );

                    const agentName = agent?.Name || 'Agent';
                    artifact.Name = `${agentName} Payload - ${new Date().toLocaleString()}`;
                    artifact.Description = `Payload returned by ${agentName}`;

                    // Use agent's DefaultArtifactTypeID if available
                    const defaultArtifactTypeId = (agent as any)?.DefaultArtifactTypeID;
                    artifact.TypeID = defaultArtifactTypeId || JSON_ARTIFACT_TYPE_ID;

                    artifact.UserID = contextUser.ID;
                    artifact.EnvironmentID = (contextUser as any).EnvironmentID ||
                                            'F51358F3-9447-4176-B313-BF8025FD8D09';

                    // Set visibility based on agent's ArtifactCreationMode
                    if (creationMode === 'System Only') {
                        artifact.Visibility = 'System Only';
                        LogStatus(`Artifact marked as "System Only" per agent configuration`);
                    } else {
                        artifact.Visibility = 'Always';
                    }

                    if (!(await artifact.Save())) {
                        throw new Error('Failed to save artifact');
                    }

                    artifactId = artifact.ID;
                    newVersionNumber = 1;
                    isNewArtifact = true;
                    LogStatus(`Created new artifact: ${artifact.Name} (${artifactId})`);
                }
            }

            // Serialize the payload once — used for both dedup check and version creation
            const serializedContent = JSON.stringify(payload, null, 2);

            // Skip version creation if content is identical to the latest version
            if (!isNewArtifact && newVersionNumber > 1) {
                const existingVersionId = await this.CheckForDuplicateVersion(
                    artifactId, serializedContent, newVersionNumber - 1, contextUser
                );
                if (existingVersionId) {
                    console.debug(`Skipping duplicate artifact version — content identical to version ${newVersionNumber - 1}`);
                    return undefined;
                }
            }

            // Create artifact version with content
            const version = await md.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                contextUser
            );
            version.ArtifactID = artifactId;
            version.VersionNumber = newVersionNumber;
            version.Content = serializedContent;
            version.UserID = contextUser.ID;

            if (!(await version.Save())) {
                throw new Error('Failed to save artifact version');
            }

            LogStatus(`Created artifact version ${newVersionNumber} (${version.ID})`);

            // If first version of new artifact, check for extracted Name attribute
            if (isNewArtifact && newVersionNumber === 1) {
                const nameAttr = (version as any).Attributes?.find((attr: any) =>
                    attr.StandardProperty === 'name' || attr.Name?.toLowerCase() === 'name'
                );

                let extractedName = nameAttr?.Value?.trim();
                if (extractedName && extractedName.toLowerCase() !== 'null') {
                    extractedName = extractedName.replace(/^["']|["']$/g, '');

                    const artifact = await md.GetEntityObject<MJArtifactEntity>(
                        'MJ: Artifacts',
                        contextUser
                    );

                    if (await artifact.Load(artifactId)) {
                        artifact.Name = extractedName;
                        if (await artifact.Save()) {
                            LogStatus(`Updated artifact name to: ${artifact.Name}`);
                        }
                    }
                }
            }

            // Link the new version to this conversation detail and return
            return this.LinkArtifactToConversationDetail(
                version.ID, conversationDetailId, artifactId, newVersionNumber, contextUser, md
            );
        } catch (error) {
            LogError(`Failed to process agent artifacts: ${(error as Error).message}`);
            return undefined;
        }
    }

    /**
     * Generates a conversation name and description using the "Name Conversation" AI prompt.
     * Same approach as UI - uses AI to create a meaningful title and description from the first user message.
     * Falls back to null if prompt not found or execution fails (caller will use fallback).
     *
     * @param userMessage - The first user message to base the name on
     * @param contextUser - User context for prompt execution
     * @returns Generated conversation name and description, or null if generation failed
     * @private
     */
    private async GenerateConversationName(
        userMessage: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<{ name: string; description: string } | null> {
        try {
            // Import AIPromptRunner, AIPromptParams, and AIEngine
            const { AIPromptRunner } = await import('@memberjunction/ai-prompts');
            const { AIPromptParams } = await import('@memberjunction/ai-core-plus');
            const { AIEngine } = await import('@memberjunction/aiengine');

            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, contextUser);

            // Find the "Name Conversation" prompt (same as UI)
            const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Name Conversation');
            if (!prompt) {
                LogStatus('Name Conversation prompt not found - using fallback naming');
                return null;
            }

            // Execute the prompt using AIPromptRunner
            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.contextUser = contextUser;
            promptParams.conversationMessages = [{ role: 'user', content: userMessage }];
            promptParams.provider = provider || this._provider;

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt(promptParams);

            if (result && result.success && result.result) {
                // Try to parse the result as JSON to extract name and description
                const parsed = typeof result.result === 'string'
                    ? JSON.parse(result.result)
                    : result.result;

                const { name, description } = parsed;
                if (name) {
                    LogStatus(`Generated conversation name via AI: "${name}" with description: "${description || ''}"`);
                    return {
                        name,
                        description: description || ''
                    };
                }
            }

            return null;
        } catch (error) {
            LogError(`Error generating conversation name: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Saves media outputs to AIAgentRunMedia table for permanent storage.
     * This creates records for each media output promoted during agent execution.
     *
     * Only media with `persist !== false` is saved. Media items with `persist: false`
     * are typically intercepted binary content that was never used in the final output.
     *
     * @param agentRunId - The ID of the agent run
     * @param mediaOutputs - Array of media outputs to save
     * @param contextUser - User context for the operation
     * @returns Array of saved AIAgentRunMedia IDs
     * @since 3.1.0
     *
     * @example
     * ```typescript
     * const runner = new AgentRunner();
     * const mediaIds = await runner.SaveAgentRunMedia(
     *     agentResult.agentRun.ID,
     *     agentResult.mediaOutputs,
     *     currentUser
     * );
     * console.log(`Saved ${mediaIds.length} media outputs`);
     * ```
     */
    public async SaveAgentRunMedia(
        agentRunId: string,
        mediaOutputs: MediaOutput[] | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string[]> {
        if (!mediaOutputs || mediaOutputs.length === 0) {
            return [];
        }

        // Filter to only persist media that should be saved
        // persist=false means intercepted but unused binary content (e.g., images not used in response)
        const mediaToSave = mediaOutputs.filter(m => m.persist !== false);
        if (mediaToSave.length === 0) {
            LogStatus(`All ${mediaOutputs.length} media outputs have persist=false, skipping save`);
            return [];
        }

        if (mediaToSave.length < mediaOutputs.length) {
            LogStatus(`Filtering: ${mediaToSave.length} of ${mediaOutputs.length} media outputs will be persisted`);
        }

        const savedIds: string[] = [];
        const md = provider || this._provider;

        try {
            // Use AIEngine's cached modalities instead of a fresh DB call
            const aiEngine = AIEngine.Instance;

            for (let i = 0; i < mediaToSave.length; i++) {
                const mediaOutput = mediaToSave[i];

                try {
                    const mediaEntity = await md.GetEntityObject<MJAIAgentRunMediaEntity>(
                        'MJ: AI Agent Run Medias',
                        contextUser
                    );

                    mediaEntity.AgentRunID = agentRunId;

                    // Link to source prompt run media if this was promoted
                    if (mediaOutput.promptRunMediaId) {
                        mediaEntity.SourcePromptRunMediaID = mediaOutput.promptRunMediaId;
                    }

                    // Get modality ID from cached engine data
                    const modality = aiEngine.GetModalityByName(mediaOutput.modality);
                    if (modality) {
                        mediaEntity.ModalityID = modality.ID;
                    } else {
                        LogError(`Unknown modality: ${mediaOutput.modality}`);
                        continue;
                    }

                    mediaEntity.MimeType = mediaOutput.mimeType;

                    // Only store inline data if NOT from prompt run media
                    if (!mediaOutput.promptRunMediaId && mediaOutput.data) {
                        mediaEntity.InlineData = mediaOutput.data;
                    }

                    // Set dimensions if available
                    if (mediaOutput.width) {
                        mediaEntity.Width = mediaOutput.width;
                    }
                    if (mediaOutput.height) {
                        mediaEntity.Height = mediaOutput.height;
                    }
                    if (mediaOutput.durationSeconds) {
                        mediaEntity.DurationSeconds = mediaOutput.durationSeconds;
                    }

                    // Set label and metadata
                    if (mediaOutput.label) {
                        mediaEntity.Label = mediaOutput.label;
                    }
                    if (mediaOutput.metadata) {
                        mediaEntity.Metadata = JSON.stringify(mediaOutput.metadata);
                    }

                    // Set description if available
                    if (mediaOutput.description) {
                        mediaEntity.Description = mediaOutput.description;
                    }

                    mediaEntity.DisplayOrder = i;

                    const saved = await mediaEntity.Save();
                    if (saved) {
                        savedIds.push(mediaEntity.ID);
                        LogStatus(`Saved AIAgentRunMedia: ${mediaEntity.ID} (${mediaOutput.modality})`);
                    } else {
                        LogError(`Failed to save AIAgentRunMedia: ${mediaEntity.LatestResult?.Message}`);
                    }
                } catch (mediaError) {
                    LogError(`Error saving media output ${i}: ${(mediaError as Error).message}`);
                }
            }

            LogStatus(`Saved ${savedIds.length} of ${mediaToSave.length} media outputs for agent run ${agentRunId}`);
            return savedIds;

        } catch (error) {
            LogError(`Error in SaveAgentRunMedia: ${(error as Error).message}`);
            return savedIds;
        }
    }

    /**
     * Creates ConversationDetailAttachment records for media outputs.
     * This enables media to be displayed in the conversation UI.
     *
     * @param conversationDetailId - The conversation detail to attach media to
     * @param mediaOutputs - Array of media outputs
     * @param agentRunMediaIds - Corresponding AIAgentRunMedia IDs
     * @param contextUser - User context for the operation
     * @returns Array of created attachment IDs
     * @since 3.1.0
     *
     * @example
     * ```typescript
     * const runner = new AgentRunner();
     * const attachmentIds = await runner.CreateConversationMediaAttachments(
     *     conversationDetailId,
     *     mediaOutputs,
     *     agentRunMediaIds,
     *     currentUser
     * );
     * ```
     */
    public async CreateConversationMediaAttachments(
        conversationDetailId: string,
        mediaOutputs: MediaOutput[],
        agentRunMediaIds: string[],
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string[]> {
        if (!mediaOutputs || mediaOutputs.length === 0) {
            return [];
        }

        const attachmentIds: string[] = [];
        const md = provider || this._provider;

        try {
            // Use AIEngine's cached modalities instead of a fresh DB call
            const aiEngine = AIEngine.Instance;

            for (let i = 0; i < mediaOutputs.length; i++) {
                const mediaOutput = mediaOutputs[i];
                const agentRunMediaId = agentRunMediaIds[i];

                if (!agentRunMediaId) {
                    LogError(`No AIAgentRunMedia ID for media output ${i}`);
                    continue;
                }

                try {
                    const attachment = await md.GetEntityObject<MJConversationDetailAttachmentEntity>(
                        'MJ: Conversation Detail Attachments',
                        contextUser
                    );

                    attachment.ConversationDetailID = conversationDetailId;
                    attachment.MimeType = mediaOutput.mimeType;
                    attachment.DisplayOrder = i;

                    // Get modality ID from cached engine data
                    const modality = aiEngine.GetModalityByName(mediaOutput.modality);
                    if (modality) {
                        attachment.ModalityID = modality.ID;
                    } else {
                        LogError(`Unknown modality: ${mediaOutput.modality}`);
                        continue;
                    }

                    // Generate a filename if none provided
                    const extension = this.getMimeTypeExtension(mediaOutput.mimeType);
                    attachment.FileName = mediaOutput.label || `${mediaOutput.modality.toLowerCase()}_${i + 1}.${extension}`;

                    // Store inline data for small media
                    // In the future, consider MJStorage for large files
                    if (mediaOutput.data) {
                        attachment.InlineData = mediaOutput.data;
                        // Estimate file size from base64 length (base64 is ~33% larger than binary)
                        attachment.FileSizeBytes = Math.ceil(mediaOutput.data.length * 0.75);
                    }

                    // Set dimensions if available
                    if (mediaOutput.width) {
                        attachment.Width = mediaOutput.width;
                    }
                    if (mediaOutput.height) {
                        attachment.Height = mediaOutput.height;
                    }
                    if (mediaOutput.durationSeconds) {
                        attachment.DurationSeconds = Math.ceil(mediaOutput.durationSeconds);
                    }

                    // Set description if available
                    if (mediaOutput.description) {
                        attachment.Description = mediaOutput.description;
                    }

                    const saved = await attachment.Save();
                    if (saved) {
                        attachmentIds.push(attachment.ID);
                        LogStatus(`Created ConversationDetailAttachment: ${attachment.ID} (${mediaOutput.modality})`);
                    } else {
                        LogError(`Failed to create attachment: ${attachment.LatestResult?.Message}`);
                    }
                } catch (attachError) {
                    LogError(`Error creating attachment ${i}: ${(attachError as Error).message}`);
                }
            }

            LogStatus(`Created ${attachmentIds.length} conversation attachments for detail ${conversationDetailId}`);
            return attachmentIds;

        } catch (error) {
            LogError(`Error in CreateConversationMediaAttachments: ${(error as Error).message}`);
            return attachmentIds;
        }
    }

    // ── File artifact processing ───────────────────────────────────────────────

    /**
     * Creates MJ: Artifact records for file outputs collected during agent execution.
     * Reads directly from `ExecuteAgentResult.fileOutputs` — no DB query needed.
     *
     * Called automatically by RunAgentInConversation after the agent completes.
     *
     * @param fileOutputs - File outputs collected by BaseAgent during action execution
     * @param conversationDetailId - The conversation detail to link artifacts to
     * @param contextUser - User context for DB operations
     * @param resolvedStorageAccountId - Pre-resolved FileStorageAccount ID from the agent's
     *   hierarchical resolution chain (Runtime → Agent → Category → Type → fallback).
     *   When provided, uploads use this specific account instead of picking the first active one.
     */
    public async ProcessFileArtifacts(
        fileOutputs: FileOutputRef[],
        conversationDetailId: string,
        contextUser: UserInfo,
        resolvedStorageAccountId?: string
    ): Promise<void> {
        if (fileOutputs.length === 0) return;

        // Hoist engine configs before parallel processing
        await Promise.all([
            ArtifactMetadataEngine.Instance.Config(false, contextUser),
            FileStorageEngine.Instance.Config(false, contextUser),
        ]);

        await Promise.all(
            fileOutputs.map(fo => this.processFileOutput(fo, conversationDetailId, contextUser, resolvedStorageAccountId))
        );
    }

    /**
     * Re-processes file artifacts from a historical agent run by querying its persisted
     * action step OutputData. Use this to recover artifacts for runs that completed before
     * ProcessFileArtifacts was introduced, or for debugging.
     *
     * @param agentRunId - The agent run whose action steps to inspect
     * @param conversationDetailId - The conversation detail to link artifacts to
     * @param contextUser - User context for DB operations
     */
    public async reprocessRunFileArtifacts(
        agentRunId: string,
        conversationDetailId: string,
        contextUser: UserInfo
    ): Promise<void> {
        const steps = await this.loadActionStepsForRun(agentRunId, contextUser);
        if (steps.length === 0) return;

        const fileOutputs = steps
            .map(step => this.parseStepFileOutput(step))
            .filter((fo): fo is FileOutputRef => fo !== null);

        await this.ProcessFileArtifacts(fileOutputs, conversationDetailId, contextUser);
    }

    /** Loads all completed action steps for a given agent run (read-only, narrow fields). */
    private async loadActionStepsForRun(agentRunId: string, contextUser: UserInfo): Promise<ActionStepSummary[]> {
        const rv = new RunView();
        const result = await rv.RunView<ActionStepSummary>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${agentRunId}' AND StepType='Actions' AND Status='Completed'`,
            Fields: ['ID', 'OutputData'],
            ResultType: 'simple'
        }, contextUser);
        return result.Success ? (result.Results ?? []) : [];
    }

    /**
     * Parses persisted OutputData JSON from an action step and extracts file output metadata.
     * Used only by the historical reprocessing path — live runs use BaseAgent's detectFileOutput.
     */
    private parseStepFileOutput(step: ActionStepSummary): FileOutputRef | null {
        if (!step.OutputData) return null;

        let outputData: ActionStepOutputData;
        try {
            outputData = JSON.parse(step.OutputData) as ActionStepOutputData;
        } catch {
            return null;
        }

        const params = outputData.actionResult?.parameters;
        if (!params) return null;

        const raw = params.find(p => p.Name?.toLowerCase() === 'fileoutput')?.Value;
        if (!raw) return null;

        const fo = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
        const fileName = fo['fileName'] as string | undefined;
        const mimeType = fo['mimeType'] as string | undefined;
        if (!fileName || !mimeType) return null;

        const fileData = fo['fileData'] as string | undefined;
        const fileId = fo['fileId'] as string | undefined;
        if (!fileData && !fileId) return null;

        return { fileName, mimeType, fileData, fileId, sizeBytes: fo['sizeBytes'] as number | undefined };
    }

    /** Uploads or resolves a single file output and creates the artifact records.
     *  Falls back to inline base64 artifact if storage is unavailable or upload fails. */
    private async processFileOutput(
        fo: FileOutputRef,
        conversationDetailId: string,
        contextUser: UserInfo,
        resolvedStorageAccountId?: string
    ): Promise<void> {
        try {
            if (fo.fileId) {
                // File already in storage — create file-backed artifact
                await this.createFileArtifact(fo.fileId, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser);
                return;
            }

            // Check if any storage accounts are configured
            const hasStorage = FileStorageEngine.Instance.AccountsWithProviders.length > 0;

            if (!hasStorage) {
                // No storage configured — go straight to inline artifact
                LogStatus(`ProcessFileArtifacts: no storage accounts configured for "${fo.fileName}", creating inline artifact`);
                await this.createInlineFileArtifact(fo.fileData!, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser);
                return;
            }

            // Try to upload to storage
            try {
                const fileId = await this.uploadBase64ToStorage(
                    fo.fileData!,
                    fo.fileName,
                    fo.mimeType,
                    contextUser,
                    resolvedStorageAccountId
                );
                await this.createFileArtifact(fileId, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser);
            } catch (storageError) {
                // Upload failed — fall back to inline artifact
                LogStatus(`ProcessFileArtifacts: storage upload failed for "${fo.fileName}", creating inline artifact: ${(storageError as Error).message}`);
                await this.createInlineFileArtifact(fo.fileData!, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser);
            }
        } catch (error) {
            LogError(`ProcessFileArtifacts: failed for "${fo.fileName}": ${(error as Error).message}`);
        }
    }

    /**
     * Uploads base64-encoded file content to MJStorage and creates an MJ: Files record.
     * Returns the new MJ: Files record ID.
     *
     * @param resolvedStorageAccountId - Pre-resolved account from the agent's storage resolution chain.
     *   When provided, uploads to this specific account. Otherwise falls back to the first active account.
     */
    private async uploadBase64ToStorage(
        base64Data: string,
        fileName: string,
        mimeType: string,
        contextUser: UserInfo,
        resolvedStorageAccountId?: string
    ): Promise<string> {
        const accounts = FileStorageEngine.Instance.AccountsWithProviders;
        if (accounts.length === 0) {
            throw new Error('No file storage accounts configured. Cannot upload file artifact.');
        }

        // Use the resolved account if provided, otherwise fall back to first active
        let resolved: StorageAccountWithProvider | undefined;
        if (resolvedStorageAccountId) {
            resolved = FileStorageEngine.Instance.GetAccountWithProvider(resolvedStorageAccountId) ?? undefined;
        }
        const { account, provider } = resolved ?? accounts.find(a => a.provider.IsActive !== false) ?? accounts[0];
        const driver = await initializeDriverWithAccountCredentials({
            accountEntity: account,
            providerEntity: provider,
            contextUser
        });

        const buffer = Buffer.from(base64Data, 'base64');
        const storagePath = `artifacts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}/${fileName}`;
        const uploaded = await driver.PutObject(storagePath, buffer, mimeType);
        if (!uploaded) {
            throw new Error(`PutObject returned false for path: ${storagePath}`);
        }

        const md = new Metadata();
        const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        fileEntity.Name = fileName;
        fileEntity.ContentType = mimeType;
        fileEntity.ProviderID = provider.ID;
        fileEntity.ProviderKey = storagePath;
        fileEntity.Status = 'Uploaded';

        if (!(await fileEntity.Save())) {
            throw new Error('Failed to save MJ: Files record after upload');
        }

        return fileEntity.ID;
    }

    /**
     * Creates MJ: Artifact, MJ: Artifact Version (ContentMode='File'), and
     * MJ: Conversation Detail Artifacts records for a single file output.
     */
    private async createFileArtifact(
        fileId: string,
        mimeType: string,
        fileName: string,
        sizeBytes: number | undefined,
        conversationDetailId: string,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();

        // Resolve the artifact type by MIME type; fall back to the built-in JSON type
        const JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';
        const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mimeType);
        if (!artifactType) {
            LogStatus(`ProcessFileArtifacts: no ArtifactType found for MIME ${mimeType}, using JSON fallback`);
        }
        const artifactTypeId = artifactType?.ID ?? JSON_ARTIFACT_TYPE_ID;

        // Create the artifact header
        const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
        artifact.Name = fileName;
        artifact.TypeID = artifactTypeId;
        artifact.UserID = contextUser.ID;
        artifact.Visibility = 'Always';

        if (!(await artifact.Save())) {
            throw new Error(`Failed to save artifact for file: ${fileName}`);
        }

        // Create the artifact version referencing the stored file
        const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', contextUser);
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.ContentMode = 'File';
        version.FileID = fileId;
        version.MimeType = mimeType;
        version.FileName = fileName;
        version.UserID = contextUser.ID;
        if (sizeBytes !== undefined) {
            version.ContentSizeBytes = sizeBytes;
        }

        if (!(await version.Save())) {
            throw new Error(`Failed to save artifact version for file: ${fileName}`);
        }

        // Link the artifact version to the conversation detail
        const junction = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            contextUser
        );
        junction.ConversationDetailID = conversationDetailId;
        junction.ArtifactVersionID = version.ID;
        junction.Direction = 'Output';

        if (!(await junction.Save())) {
            throw new Error(`Failed to link file artifact to conversation detail: ${conversationDetailId}`);
        }

        LogStatus(`Created file artifact: ${fileName} (${mimeType}) → artifact ${artifact.ID}, version ${version.ID}`);
    }

    /**
     * Creates an artifact with file content stored inline as a base64 data URL.
     * Used when MJStorage is not configured or upload fails.
     * The ArtifactVersion stores the content directly rather than referencing a FileID.
     */
    private async createInlineFileArtifact(
        base64Data: string,
        mimeType: string,
        fileName: string,
        sizeBytes: number | undefined,
        conversationDetailId: string,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();

        const JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';
        const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mimeType);
        if (!artifactType) {
            LogStatus(`ProcessFileArtifacts: no ArtifactType found for MIME ${mimeType}, using JSON fallback`);
        }
        const artifactTypeId = artifactType?.ID ?? JSON_ARTIFACT_TYPE_ID;

        // Create the artifact header
        const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
        artifact.Name = fileName;
        artifact.TypeID = artifactTypeId;
        artifact.UserID = contextUser.ID;
        artifact.Visibility = 'Always';

        if (!(await artifact.Save())) {
            throw new Error(`Failed to save inline artifact for file: ${fileName}`);
        }

        // Create the artifact version with inline content (base64 data URL)
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', contextUser);
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.ContentMode = 'Text';
        version.Content = dataUrl;
        version.MimeType = mimeType;
        version.FileName = fileName;
        version.UserID = contextUser.ID;
        if (sizeBytes !== undefined) {
            version.ContentSizeBytes = sizeBytes;
        }

        if (!(await version.Save())) {
            throw new Error(`Failed to save inline artifact version for file: ${fileName}`);
        }

        // Link the artifact version to the conversation detail
        const junction = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            contextUser
        );
        junction.ConversationDetailID = conversationDetailId;
        junction.ArtifactVersionID = version.ID;
        junction.Direction = 'Output';

        if (!(await junction.Save())) {
            throw new Error(`Failed to link inline file artifact to conversation detail: ${conversationDetailId}`);
        }

        LogStatus(`Created inline file artifact: ${fileName} (${mimeType}) → artifact ${artifact.ID}, version ${version.ID} [no storage]`);
    }

    /**
     * Gets file extension from MIME type
     * @private
     */
    private getMimeTypeExtension(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'audio/ogg': 'ogg',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/ogg': 'ogv'
        };
        return mimeToExt[mimeType.toLowerCase()] || 'bin';
    }
}