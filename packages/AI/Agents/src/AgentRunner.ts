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
import { LogError, LogStatusEx, IsVerboseLoggingEnabled, LogStatus, Metadata, RunView, RunQuery, UserInfo, IMetadataProvider, DatabaseProviderBase, ProviderType } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ExecuteAgentResult, ExecuteAgentParams, MediaOutput, FileOutputRef, InputArtifact } from '@memberjunction/ai-core-plus';
import { BaseAgent } from './base-agent';
import { MJConversationEntity, MJConversationDetailEntity, MJArtifactEntity, MJArtifactVersionEntity, MJConversationDetailArtifactEntity, MJAIAgentRunMediaEntity, ArtifactMetadataEngine, ExtractBase64FromDataUrl, DecideInlineStorage } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';

/**
 * Row shape returned by the `GetArtifactVersionsByID` stored query.
 * Joins vwArtifactVersions → vwArtifacts → vwArtifactTypes so one
 * round-trip gives us everything `gatherConversationArtifacts` needs.
 */
interface ArtifactVersionRow {
    VersionID: string;
    VersionName: string | null;
    ContentMode: 'File' | 'Text';
    FileID: string | null;
    Content: string | null;
    MimeType: string | null;
    ForceToolsOnly: boolean | null;
    ArtifactName: string;
    TypeName: string;
    ToolLibraryClass: string | null;
    DefaultDeliveryMode: 'Inline' | 'ToolsOnly' | null;
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
        this._provider = provider ?? Metadata.Provider;
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
                    conversation.UserID = params.userId || contextUser.ID;
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
                        const saved = await agentResponseDetail.Save();
                        if (!saved) {
                            LogError('Failed to save agent response detail progress update');
                        }
                    }
                    // Call original callback if provided
                    if (originalOnProgress) {
                        await originalOnProgress(progress);
                    }
                }
                : originalOnProgress;

            // Gather all artifacts from this conversation for the ArtifactToolManager.
            // Per design doc Section 8.8: in the in-conversation flow, "the agent continues
            // the conversation with the artifact already available." This means ALL artifacts
            // in the conversation (both agent-produced Output and user-attached Input) should
            // be available to the agent via artifact tools.
            const inputArtifacts = await this.gatherConversationArtifacts(conversationId, contextUser);

            const modifiedParams: ExecuteAgentParams<C> = {
                ...params,
                data: {
                    ...params.data,
                    conversationId,
                },
                inputArtifacts: inputArtifacts.length > 0 ? inputArtifacts : undefined,
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
            // IMPORTANT: All of these MUST complete before the resolver publishes the 'complete'
            // event, because the client reloads all conversation data from the DB when it receives
            // that event. If any write hasn't flushed yet, the client would see stale data. They run
            // SEQUENTIALLY (not in parallel) — see the dispatch note below the definitions.

            // Step 5: Update agent response detail with final result.
            const updateDetail = async () => {
                if (agentResponseDetail && agentResponseDetailId) {
                    // Wait for any in-flight progress save to complete
                    // EnsureSaveComplete() resolves immediately if no save in progress
                    await agentResponseDetail.EnsureSaveComplete();

                    LogStatus('Updating agent response detail with final result');

                    // Reload to get any updates from agent execution
                    const loaded = await agentResponseDetail.Load(agentResponseDetailId);
                    if (!loaded) {
                        LogError(`Failed to reload agent response detail ${agentResponseDetailId}`);
                    }

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

                    const saved = await agentResponseDetail.Save();
                    if (!saved) {
                        LogError(`Failed to save agent response detail ${agentResponseDetailId} with final status`);
                    }
                    LogStatus(`Updated agent response detail ${agentResponseDetailId} with final status: ${agentResponseDetail.Status}`);
                }
            };

            // Step 6: Process artifacts if requested and agent succeeded.
            const processArtifacts = async () => {
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
            };

            // Step 6b: Process file artifacts produced by file-generation actions.
            const processFileArtifacts = async () => {
                if (agentResult.success && agentResponseDetailId && agentResult.fileOutputs?.length) {
                    await this.ProcessFileArtifacts(
                        agentResult.fileOutputs,
                        agentResponseDetailId,
                        contextUser,
                        agentResult.resolvedStorageAccountId,
                        md,
                        params.agent.AcceptUnregisteredFiles
                    );
                }
            };

            // Step 7: Save media outputs to AIAgentRunMedia (audit) and create artifacts (display)
            const saveMedia = async () => {
                if (agentResult.mediaOutputs && agentResult.mediaOutputs.length > 0) {
                    const mediaToSave = agentResult.mediaOutputs;
                    LogStatus(`Processing ${mediaToSave.length} media output(s)`);

                    // Save to AIAgentRunMedia for permanent audit/lineage storage
                    const ids = await this.SaveAgentRunMedia(
                        agentResult.agentRun.ID,
                        mediaToSave,
                        contextUser,
                        md
                    );

                    // Create Artifact + ArtifactVersion + ConversationDetailArtifact for each
                    // media output so the chat UI renders them as artifact cards. This replaces
                    // the old CreateConversationMediaAttachments path which wrote to the deprecated
                    // ConversationDetailAttachment table (the server hook then auto-paired to an
                    // artifact). Writing artifacts directly removes the deprecated-entity dependency
                    // and the redundant dual-write. Uses the same createArtifactWithVersion helper
                    // that ProcessFileArtifacts uses, keeping artifact creation logic in one place.
                    //
                    // Suppress standalone artifacts for media already embedded in the report
                    // payload (e.g. the research agent inlines its infographic as a base64 <img>
                    // in report.html). Without this, the same image surfaces twice — once inside
                    // the report and once as its own artifact card. Media NOT found in the payload
                    // (e.g. Sage → Generate Image, where the image IS the deliverable) still gets a
                    // standalone artifact. Note: SaveAgentRunMedia above is intentionally run over
                    // the FULL list — the bytes are always retained for audit/lineage regardless.
                    const payloadStr = agentResult.payload ? JSON.stringify(agentResult.payload) : '';
                    const mediaForArtifacts = payloadStr
                        ? mediaToSave.filter(m => !this.isMediaEmbeddedInPayload(m, payloadStr))
                        : mediaToSave;

                    if (agentResponseDetailId && mediaForArtifacts.length > 0) {
                        await this.CreateMediaArtifacts(
                            agentResponseDetailId,
                            mediaForArtifacts,
                            contextUser,
                            md
                        );
                    }
                    return ids;
                }
                return [];
            };

            // Run these post-execution DB writes SEQUENTIALLY, not concurrently. They all mutate
            // entities through the same request-scoped provider/connection, and the file/media path
            // (createArtifactWithVersion) wraps its writes in an explicit BeginTransaction/Commit on
            // that shared connection. Running them in parallel let the media transaction interleave
            // with the report path's artifact + ConversationDetailArtifact saves, so the report's
            // junction Save intermittently failed — the throw was swallowed and the report artifact
            // was left orphaned (no conversation-detail link), surfacing in chat as "only the image,
            // no report." Sequential execution removes the interleave; all writes still complete
            // before we return, so the resolver's 'complete' event still guarantees the client sees
            // every write.
            await updateDetail();
            const artifactInfo = await processArtifacts();
            await processFileArtifacts();
            await saveMedia();

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
    public async GetMaxVersionForArtifact(artifactId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<number> {
        try {
            const rv = RunView.FromMetadataProvider(provider || this._provider);
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
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        const candidateHash = createHash('sha256').update(candidateContent, 'utf8').digest('hex');

        const rv = RunView.FromMetadataProvider(provider || this._provider);
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
            const rv = RunView.FromMetadataProvider(provider || this._provider);
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
                const maxVersion = await this.GetMaxVersionForArtifact(sourceArtifactId, contextUser, provider);
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
                    artifactId, serializedContent, newVersionNumber - 1, contextUser, provider
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
     * Creates a record for each media output promoted during agent execution.
     * All items in the array are saved.
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

        const mediaToSave = mediaOutputs;

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

    // ── Media artifact creation ─────────────────────────────────────────────────

    /**
     * Determines whether a media output's bytes are already embedded inside the agent's
     * output payload (which is serialized into the report artifact by
     * {@link ProcessAgentArtifacts}).
     *
     * WHY: agents like the research agent write a report (e.g. `report.html`) that inlines
     * a generated image as a base64 data URL (`<img src="data:image/png;base64,…">`). That
     * same image ALSO arrives on `agentResult.mediaOutputs`, so creating a standalone media
     * artifact for it would duplicate the image — once inside the report, once as its own
     * card. When the media is provably embedded in the payload we skip the standalone
     * artifact. Media that is NOT in the payload (e.g. Sage → Generate Image, where the
     * image is the deliverable) is left alone and still persists as its own artifact.
     *
     * The check is purely in-memory (no DB query): we look for a representative chunk of the
     * media's base64 bytes inside the already-serialized payload string. base64 blobs are
     * large, so matching a fixed-length prefix is both cheap and robust against the payload
     * wrapping the data in a `data:<mime>;base64,` prefix.
     *
     * @param media - The media output under consideration
     * @param payloadStr - The agent payload pre-serialized via JSON.stringify (caller-cached)
     * @returns true if the media bytes appear in the payload, false otherwise
     */
    private isMediaEmbeddedInPayload(media: MediaOutput, payloadStr: string): boolean {
        if (!payloadStr || !media.data) {
            return false;
        }

        // Strip any data-URL prefix so the needle is raw base64 — the payload may store the
        // image either as a bare base64 string or wrapped in a data URL; the base64 body is
        // common to both forms.
        const rawBase64 = media.data.replace(/^data:[^;]+;base64,/, '');

        // A fixed-length prefix is plenty to identify a specific base64 blob without scanning
        // the entire (potentially multi-MB) string for an exact full-length match.
        const needle = rawBase64.slice(0, 256);
        if (needle.length === 0) {
            return false;
        }

        return payloadStr.includes(needle);
    }

    /**
     * Creates `MJ: Artifact` + `MJ: Artifact Version` + `MJ: Conversation Detail Artifact`
     * junction records for agent-produced media outputs (images, audio, video).
     *
     * Replaces the deprecated `CreateConversationMediaAttachments` path which wrote to
     * the `MJ: Conversation Detail Attachments` table (then auto-paired to an artifact
     * via the server-side hook). Writing artifacts directly removes the deprecated-entity
     * dependency and the redundant dual-write.
     *
     * Reuses {@link createArtifactWithVersion} — the same helper that `ProcessFileArtifacts`
     * uses — so artifact creation logic (MIME resolution, transaction wrapping, junction
     * linking) lives in exactly one place.
     *
     * @param conversationDetailId - The conversation detail to link artifacts to
     * @param mediaOutputs - Media outputs to persist as artifacts
     * @param contextUser - User context for DB operations
     * @param provider - Optional metadata provider for multi-provider support
     *
     * @since 5.38.0
     */
    public async CreateMediaArtifacts(
        conversationDetailId: string,
        mediaOutputs: MediaOutput[],
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        if (!mediaOutputs || mediaOutputs.length === 0) {
            return;
        }

        await ArtifactMetadataEngine.Instance.Config(false, contextUser);
        const md = provider || this._provider;
        let successCount = 0;

        for (let i = 0; i < mediaOutputs.length; i++) {
            const media = mediaOutputs[i];

            try {
                const extension = this.getMimeTypeExtension(media.mimeType);
                const fileName = media.label || `${media.modality.toLowerCase()}_${i + 1}.${extension}`;
                const estimatedSizeBytes = media.data
                    ? Math.ceil(media.data.length * 0.75)
                    : undefined;

                await this.createArtifactWithVersion({
                    mimeType: media.mimeType,
                    fileName,
                    sizeBytes: estimatedSizeBytes,
                    conversationDetailId,
                    contextUser,
                    provider: md,
                    acceptUnregisteredFiles: true,
                    label: `media ${media.modality}`,
                    setVersionFields: (version) => {
                        // DecideInlineStorage applies consistent text-vs-binary storage
                        // decisions across all artifact creation paths. For media (images,
                        // audio, video), it wraps the base64 in a data URL; for text-y
                        // MIMEs it decodes to UTF-8. Same helper the server hook and
                        // ConversationAttachmentService use.
                        if (media.data) {
                            const stored = DecideInlineStorage(media.mimeType, media.data);
                            version.ContentMode = stored.contentMode;
                            version.Content = stored.content;
                        }
                    }
                });

                successCount++;
            } catch (error) {
                LogError(`Error creating media artifact ${i} (${media.modality}): ${(error as Error).message}`);
            }
        }

        LogStatus(`Created ${successCount} of ${mediaOutputs.length} media artifact(s) for detail ${conversationDetailId}`);
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
        resolvedStorageAccountId?: string,
        provider?: IMetadataProvider,
        acceptUnregisteredFiles?: boolean
    ): Promise<void> {
        if (fileOutputs.length === 0) return;

        const md = provider || this._provider;
        const acceptUnregistered = acceptUnregisteredFiles ?? false;

        // Hoist engine configs before parallel processing
        await Promise.all([
            ArtifactMetadataEngine.Instance.Config(false, contextUser),
            FileStorageEngine.Instance.Config(false, contextUser),
        ]);

        await Promise.all(
            fileOutputs.map(fo => this.processFileOutput(fo, conversationDetailId, contextUser, resolvedStorageAccountId, md, acceptUnregistered))
        );
    }

    /** Uploads or resolves a single file output and creates the artifact records.
     *  Falls back to inline base64 artifact if storage is unavailable or upload fails. */
    private async processFileOutput(
        fo: FileOutputRef,
        conversationDetailId: string,
        contextUser: UserInfo,
        resolvedStorageAccountId: string | undefined,
        provider: IMetadataProvider,
        acceptUnregisteredFiles: boolean
    ): Promise<void> {
        try {
            if (fo.fileId) {
                // File already in storage — create file-backed artifact
                await this.createFileArtifact(fo.fileId, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles);
                return;
            }

            // Check if any storage accounts are configured
            const hasStorage = FileStorageEngine.Instance.HasStorageAccounts;

            if (!hasStorage) {
                // No storage configured — go straight to inline artifact
                LogStatus(`ProcessFileArtifacts: no storage accounts configured for "${fo.fileName}", creating inline artifact`);
                await this.createInlineFileArtifact(fo.fileData!, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles);
                return;
            }

            // Try to upload to storage
            try {
                const fileId = await this.uploadBase64ToStorage(
                    fo.fileData!,
                    fo.fileName,
                    fo.mimeType,
                    contextUser,
                    resolvedStorageAccountId,
                    provider
                );
                await this.createFileArtifact(fileId, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles);
            } catch (storageError) {
                // Upload failed — fall back to inline artifact
                LogStatus(`ProcessFileArtifacts: storage upload failed for "${fo.fileName}", creating inline artifact: ${(storageError as Error).message}`);
                await this.createInlineFileArtifact(fo.fileData!, fo.mimeType, fo.fileName, fo.sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles);
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
        resolvedStorageAccountId: string | undefined,
        provider: IMetadataProvider
    ): Promise<string> {
        const result = await FileStorageEngine.Instance.UploadFile({
            content: Buffer.from(base64Data, 'base64'),
            fileName,
            mimeType,
            contextUser,
            storageAccountId: resolvedStorageAccountId,
            provider
        });
        return result.FileID;
    }

    /**
     * Shared logic for creating an artifact + version + conversation detail link in a single
     * transaction. The caller provides a callback to set the version-specific fields (file-backed
     * vs. inline content).
     */
    private async createArtifactWithVersion(
        params: {
            mimeType: string;
            fileName: string;
            sizeBytes: number | undefined;
            conversationDetailId: string;
            contextUser: UserInfo;
            provider: IMetadataProvider;
            /** Whether to fall back to the Generic Binary artifact type when MIME has no exact match. */
            acceptUnregisteredFiles: boolean;
            /** Callback to set version-specific fields (ContentMode, FileID/Content, etc.) */
            setVersionFields: (version: MJArtifactVersionEntity) => void;
            /** Label for log/error messages (e.g. 'file' or 'inline file') */
            label: string;
        }
    ): Promise<void> {
        const { mimeType, fileName, sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles, setVersionFields, label } = params;

        // Resolve the artifact type using the wildcard-aware resolver with an
        // extension hint for application/octet-stream uploads.
        const fileExtension = fileName.includes('.') ? fileName.split('.').pop() : undefined;
        const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mimeType, fileExtension);

        let artifactTypeId: string;
        if (artifactType) {
            artifactTypeId = artifactType.ID;
        } else if (acceptUnregisteredFiles) {
            // Per-agent opt-in: resolve to the Generic Binary fallback.
            const genericBinary = ArtifactMetadataEngine.Instance.ArtifactTypes.find(
                t => t.Name === 'Generic Binary'
            );
            if (!genericBinary) {
                throw new Error(
                    `Cannot create artifact for ${label} "${fileName}": MIME type "${mimeType}" is not registered and the Generic Binary fallback type is missing from the artifact registry.`
                );
            }
            LogStatus(`ProcessFileArtifacts: no exact ArtifactType for MIME "${mimeType}"; resolving to Generic Binary fallback (agent has AcceptUnregisteredFiles=true).`);
            artifactTypeId = genericBinary.ID;
        } else {
            throw new Error(
                `Cannot create artifact for ${label} "${fileName}": MIME type "${mimeType}" is not supported. ` +
                `Register an Artifact Type for this MIME, or set AcceptUnregisteredFiles=true on this agent to use the Generic Binary fallback.`
            );
        }

        // Use direct provider transaction (BeginTransaction/CommitTransaction) instead of
        // TransactionGroup. This ensures saves execute immediately within the SQL transaction,
        // so server-side entity hooks (e.g. ArtifactVersion.ExtractAndSaveAttributes) can
        // Load() parent records that were saved earlier in the same transaction.
        const dbProvider = provider as unknown as DatabaseProviderBase;
        const useTransaction = dbProvider.ProviderType === ProviderType.Database;

        if (useTransaction) {
            await dbProvider.BeginTransaction();
        }

        try {
            // Create the artifact header
            const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
            artifact.Name = fileName;
            artifact.TypeID = artifactTypeId;
            artifact.UserID = contextUser.ID;
            artifact.Visibility = 'Always';
            if (!(await artifact.Save())) {
                throw new Error(`Failed to save artifact for ${label}: ${fileName}`);
            }

            // Create the artifact version — shared fields first, then caller-specific fields
            const version = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', contextUser);
            version.ArtifactID = artifact.ID;
            version.VersionNumber = 1;
            version.MimeType = mimeType;
            version.FileName = fileName;
            version.UserID = contextUser.ID;
            if (sizeBytes !== undefined) {
                version.ContentSizeBytes = sizeBytes;
            }
            setVersionFields(version);
            if (!(await version.Save())) {
                throw new Error(`Failed to save artifact version for ${label}: ${fileName}`);
            }

            // Link the artifact version to the conversation detail
            const junction = await provider.GetEntityObject<MJConversationDetailArtifactEntity>(
                'MJ: Conversation Detail Artifacts',
                contextUser
            );
            junction.ConversationDetailID = conversationDetailId;
            junction.ArtifactVersionID = version.ID;
            junction.Direction = 'Output';
            if (!(await junction.Save())) {
                throw new Error(`Failed to link ${label} artifact to conversation detail: ${conversationDetailId}`);
            }

            if (useTransaction) {
                await dbProvider.CommitTransaction();
            }

            LogStatus(`Created ${label} artifact: ${fileName} (${mimeType}) → artifact ${artifact.ID}, version ${version.ID}`);
        } catch (error) {
            if (useTransaction) {
                try {
                    await dbProvider.RollbackTransaction();
                } catch (rollbackError) {
                    LogError(`Failed to rollback ${label} artifact transaction: ${rollbackError}`);
                }
            }
            throw error;
        }
    }

    /** Creates a file-backed artifact (version references a FileID in MJStorage). */
    private async createFileArtifact(
        fileId: string,
        mimeType: string,
        fileName: string,
        sizeBytes: number | undefined,
        conversationDetailId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        acceptUnregisteredFiles: boolean
    ): Promise<void> {
        await this.createArtifactWithVersion({
            mimeType, fileName, sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles,
            label: 'file',
            setVersionFields: (version) => {
                version.ContentMode = 'File';
                version.FileID = fileId;
            }
        });
    }

    /** Creates an inline artifact (version stores base64 data URL directly, no MJStorage). */
    private async createInlineFileArtifact(
        base64Data: string,
        mimeType: string,
        fileName: string,
        sizeBytes: number | undefined,
        conversationDetailId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        acceptUnregisteredFiles: boolean
    ): Promise<void> {
        await this.createArtifactWithVersion({
            mimeType, fileName, sizeBytes, conversationDetailId, contextUser, provider, acceptUnregisteredFiles,
            label: 'inline file',
            setVersionFields: (version) => {
                version.ContentMode = 'Text';
                version.Content = `data:${mimeType};base64,${base64Data}`;
            }
        });
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

    /**
     * Gathers all artifacts from a conversation (both artifact-system records and
     * uploaded file attachments) so the ArtifactToolManager can make them available
     * to the agent as input artifacts.
     */
    private async gatherConversationArtifacts(conversationId: string, contextUser: UserInfo): Promise<InputArtifact[]> {
        try {
            const rv = new RunView();

            // Get all conversation detail IDs for this conversation
            const details = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `ConversationID='${conversationId}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                contextUser,
            );

            if (!details.Success || details.Results.length === 0) {
                return [];
            }

            const detailIds = details.Results.map((d) => d.ID);

            // Get all artifact junctions for these conversation details
            const junctions = await rv.RunView<{ ID: string; ArtifactVersionID: string | null }>(
                {
                    EntityName: 'MJ: Conversation Detail Artifacts',
                    ExtraFilter: `ConversationDetailID IN ('${detailIds.join("','")}')`,
                    Fields: ['ID', 'ArtifactVersionID'],
                    ResultType: 'simple',
                },
                contextUser,
            );

            // Process artifact junctions (if any) — but don't return early,
            // because file attachments (ConversationDetailAttachment) are checked
            // separately below and may exist even when there are no artifact junctions.
            const seenVersionIds = new Set<string>();
            const uniqueJunctions = (junctions.Success && junctions.Results.length > 0)
                ? junctions.Results.filter((j) => {
                    const vid = j.ArtifactVersionID?.toLowerCase();
                    if (!vid || seenVersionIds.has(vid)) return false;
                    seenVersionIds.add(vid);
                    return true;
                })
                : [];

            const inputArtifacts: InputArtifact[] = [];

            if (uniqueJunctions.length > 0) {
                const versionIds = uniqueJunctions.map((j) => j.ArtifactVersionID);

                const rq = new RunQuery();
                const versionResult = await rq.RunQuery(
                    {
                        QueryName: 'GetArtifactVersionsByID',
                        CategoryPath: '/MJ/AI/Agents/',
                        Parameters: { versionIds },
                    },
                    contextUser,
                );

                if (!versionResult.Success) {
                    LogError(`[AgentRunner] GetArtifactVersionsByID failed: ${versionResult.ErrorMessage}`);
                } else {
                    for (const row of versionResult.Results as ArtifactVersionRow[]) {
                        const artifactName = row.VersionName || row.ArtifactName || 'Untitled';
                        const typeName = row.TypeName || 'Text';

                        let content: string | Buffer = '';
                        if (row.ContentMode === 'File' && row.FileID) {
                            const downloaded = await this.downloadArtifactFileContent(row.FileID, contextUser);
                            if (downloaded) {
                                content = downloaded;
                            } else {
                                LogError(`[AgentRunner] Failed to download file content for artifact "${artifactName}" (FileID: ${row.FileID})`);
                                continue;
                            }
                        } else {
                            content = row.Content || '';
                        }

                        // Binary artifacts stored as a base64 data URL by the
                        // server hook (xlsx, docx, pdf, image when inline) need
                        // to reach their tool libraries as a Buffer of the
                        // decoded bytes — the libraries call
                        // `Buffer.from(content, 'base64')` and that fails on
                        // the `data:<mime>;base64,` prefix. Pure helper shared
                        // with the server-hook unit tests.
                        if (typeof content === 'string') {
                            content = ExtractBase64FromDataUrl(content);
                        }

                        if (typeof content === 'string' && content) {
                            content = await this.hydrateSqlBackedContent(content, contextUser);
                        }

                        if (content) {
                            inputArtifacts.push({
                                name: artifactName,
                                typeName,
                                content,
                                mimeType: row.MimeType ?? undefined,
                                ...(row.ToolLibraryClass ? { toolLibraryClass: row.ToolLibraryClass } : {}),
                                deliveryMode: row.DefaultDeliveryMode ?? 'ToolsOnly',
                                forceToolsOnly: row.ForceToolsOnly === true,
                            });
                        }
                    }
                }
            }

            if (inputArtifacts.length > 0) {
                LogStatus(`[AgentRunner] Gathered ${inputArtifacts.length} input artifact(s) for conversation ${conversationId}: ${inputArtifacts.map(a => `${a.typeName}:"${a.name}" (${a.mimeType || 'no mime'})`).join(', ')}`);
            } else {
                LogStatus(`[AgentRunner] No input artifacts found for conversation ${conversationId} (${junctions.Results.length} artifact junction(s) checked)`);
            }

            return inputArtifacts;
        } catch (error) {
            LogError(`[AgentRunner] Failed to gather conversation artifacts: ${error}`);
            return [];
        }
    }

    /**
     * Data artifacts from some agents persist the SQL spec (columns +
     * `metadata.sql`) but not the resulting rows — the rows are re-executed
     * live by `data-artifact-viewer` at render time. When an agent consumes the
     * artifact directly there is no render step, so the tool library would see
     * an empty `rows` array and report zero data.
     *
     * This method detects that shape (both the single-table legacy format and
     * the multi-table `tables[]` format) and executes the stored SQL via
     * `RunQuery` to inject real rows into the content before it reaches
     * `ArtifactToolManager`. No-op for binary content, non-JSON content, or
     * content that already has rows populated.
     *
     * Security: `RunQuery` uses the same read-only, `SQLExpressionValidator`-
     * checked execution path that `data-artifact-viewer` already uses at
     * render time — identical security posture to the existing view path.
     */
    private async hydrateSqlBackedContent(content: string, contextUser: UserInfo): Promise<string> {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(content);
        } catch {
            return content;
        }

        let changed = false;
        const rq = new RunQuery();

        const rootMeta = parsed?.metadata as { sql?: string; rowCount?: number; executionTimeMs?: number } | undefined;
        const rootRows = parsed?.rows as unknown[] | undefined;
        if (rootMeta?.sql && (!rootRows || rootRows.length === 0)) {
            const result = await rq.RunQuery({ SQL: rootMeta.sql }, contextUser);
            if (result.Success) {
                parsed.rows = result.Results;
                parsed.metadata = {
                    ...rootMeta,
                    rowCount: result.RowCount,
                    executionTimeMs: result.ExecutionTime,
                };
                changed = true;
            } else {
                LogError(`[AgentRunner] hydrateSqlBackedContent root SQL failed: ${result.ErrorMessage}`);
            }
        }

        const tables = parsed?.tables as Array<{ metadata?: { sql?: string; rowCount?: number; executionTimeMs?: number }; rows?: unknown[] }> | undefined;
        if (Array.isArray(tables)) {
            for (const table of tables) {
                if (table?.metadata?.sql && (!table.rows || table.rows.length === 0)) {
                    const result = await rq.RunQuery({ SQL: table.metadata.sql }, contextUser);
                    if (result.Success) {
                        table.rows = result.Results;
                        table.metadata.rowCount = result.RowCount;
                        table.metadata.executionTimeMs = result.ExecutionTime;
                        changed = true;
                    } else {
                        LogError(`[AgentRunner] hydrateSqlBackedContent table SQL failed: ${result.ErrorMessage}`);
                    }
                }
            }
        }

        return changed ? JSON.stringify(parsed) : content;
    }

    /**
     * Infer an artifact type name from a MIME type so ArtifactToolManager
     * can resolve the correct tool library.
     */
    private inferArtifactTypeName(mimeType: string): string {
        if (mimeType.startsWith('application/pdf')) return 'PDF';
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('ms-excel')) return 'Excel';
        if (mimeType.includes('wordprocessing') || mimeType.includes('msword')) return 'Word';
        if (mimeType === 'application/json') return 'JSON';
        if (mimeType.startsWith('text/')) return 'Text';
        return 'Text'; // Fallback
    }

    /**
     * Downloads binary content for a file-backed artifact from MJStorage.
     * Uses FileStorageEngine to resolve the storage account and driver,
     * then fetches the file by its ProviderKey.
     *
     * @param fileId - The MJ: Files entity ID referenced by ArtifactVersion.FileID
     * @param contextUser - User context for storage driver authentication
     * @returns Buffer of file content, or null if download fails
     */
    private async downloadArtifactFileContent(fileId: string, contextUser: UserInfo): Promise<Buffer | null> {
        try {
            await FileStorageEngine.Instance.Config(false, contextUser);

            const rv = new RunView();
            const fileResult = await rv.RunView<{ ID: string; Name: string; ContentType: string; ProviderID: string; ProviderKey: string }>(
                {
                    EntityName: 'MJ: Files',
                    ExtraFilter: `ID = '${fileId}'`,
                    Fields: ['ID', 'Name', 'ContentType', 'ProviderID', 'ProviderKey'],
                    ResultType: 'simple',
                },
                contextUser,
            );

            if (!fileResult.Success || fileResult.Results.length === 0) {
                LogError(`[AgentRunner] File not found in MJ: Files for FileID: ${fileId}`);
                return null;
            }

            const file = fileResult.Results[0];
            const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
            if (accounts.length === 0) {
                LogError(`[AgentRunner] No FileStorageAccount found for ProviderID: ${file.ProviderID}`);
                return null;
            }

            const driver = await FileStorageEngine.Instance.GetDriver(accounts[0].ID, contextUser);
            const objectName = file.ProviderKey ?? file.Name;
            const content = await driver.GetObject({ fullPath: objectName });

            // GetObject returns string or Buffer depending on provider
            if (Buffer.isBuffer(content)) {
                return content;
            }
            return Buffer.from(content as string);
        } catch (error) {
            LogError(`[AgentRunner] Failed to download file content for FileID ${fileId}: ${error}`);
            return null;
        }
    }
}