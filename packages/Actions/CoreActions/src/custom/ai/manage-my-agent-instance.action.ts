import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { CompositeKey, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentPersonaEntity,
    MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride,
    MJAIAgentUserPolicyEntity,
    MJAIPersonaEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    ApplyDefaultAgentUserPolicyValues,
    MJAIAgentEntityExtended,
    ResolveAgentInstantiationConfig,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

type ManageInstanceOperation = 'Create' | 'Update' | 'ListMine' | 'SetPrimary' | 'Archive';

interface ActionExecutionContext {
    AgentID?: string;
    AgentName?: string;
    ConversationID?: string;
}

interface AgentInstanceSummary {
    ID: string;
    Name: string;
    Description: string | null;
    BaseAgentID: string | null;
    BaseAgentName: string | null;
    IconClass: string | null;
    LogoURL: string | null;
    IsPrimaryInstance: boolean;
    AdditionalInstructions: string | null;
    Status: MJAIAgentEntity['Status'];
    PersonaID: string | null;
    PersonaName: string | null;
    Tone: string | null;
    SpeakingStyle: string | null;
    ConversationPinned: boolean;
}

/**
 * Creates, updates, lists, promotes to primary, or archives a personal AI Agent instance derived
 * from an instantiable prototype agent (such as `Chief of Staff`, `Research Agent`, or `Query Builder`).
 *
 * Atomically manages:
 * 1. The derived `MJ: AI Agents` row (`BaseAgentID`, `OwnerUserID = contextUser.ID`, `Name`,
 *    `Description`, `IconClass`, `LogoURL`, `AdditionalInstructions`, `IsPrimaryInstance`,
 *    `InstantiationMode = 'None'`, `Status = 'Active'`).
 * 2. Its optional `MJ: AI Agent Personas` link + `StyleOverrideObject` (`Tone`, `SpeakingStyle`)
 *    unifying text chat and Realtime voice personality.
 * 3. Its optional `MJ: AI Agent User Policies` row (`CoordinationMode`, `OnboardingStatus = 'Completed'`).
 * 4. Optional `MJ: Conversations.DefaultAgentID` re-pinning so conversational onboarding
 *    seamlessly transitions into the user's freshly personalized instance in the very same thread.
 */
@RegisterClass(BaseAction, 'Manage My Agent Instance')
export class ManageMyAgentInstanceAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'Manage My Agent Instance requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const operation = this.parseOperation(this.getStringParam(params, 'Operation'));
            if (!operation) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_OPERATION',
                    Message: `Unsupported Operation "${this.getStringParam(params, 'Operation') ?? ''}". Expected one of: Create, Update, ListMine, SetPrimary, Archive.`,
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;

            switch (operation) {
                case 'Create':
                    return await this.handleCreate(params, contextUser, md);
                case 'Update':
                    return await this.handleUpdate(params, contextUser, md);
                case 'ListMine':
                    return this.handleListMine(params, contextUser);
                case 'SetPrimary':
                    return await this.handleSetPrimary(params, contextUser, md);
                case 'Archive':
                    return await this.handleArchive(params, contextUser, md);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ManageMyAgentInstanceAction error: ${message}`);
            return {
                Success: false,
                ResultCode: 'SAVE_FAILED',
                Message: `Error managing agent instance: ${message}`,
                Params: params.Params,
            };
        }
    }

    private async handleCreate(
        params: RunActionParams,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<ActionResultSimple> {
        const baseAgent = this.resolveBaseAgentForCreate(params);
        if (!baseAgent) {
            return {
                Success: false,
                ResultCode: 'AGENT_NOT_FOUND',
                Message: 'Could not resolve the base prototype agent. Provide BaseAgentID or BaseAgentName.',
                Params: params.Params,
            };
        }

        if (!AIEngine.Instance.CanUserRunAgent(baseAgent.ID, contextUser)) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message: `You do not have permission to instantiate "${baseAgent.Name}".`,
                Params: params.Params,
            };
        }

        const isOwner = contextUser.Type === 'Owner';
        if (baseAgent.InstantiationMode === 'None' && !isOwner) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message: `Agent "${baseAgent.Name}" does not allow personal instantiation (InstantiationMode = 'None').`,
                Params: params.Params,
            };
        }

        const rawName = this.getStringParam(params, 'Name')?.trim();
        if (!rawName) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: 'A non-empty Name is required to create an agent instance.',
                Params: params.Params,
            };
        }

        // Check maxInstancesPerUser hint before DB roundtrip (reads canonical Configuration.instantiation
        // with multi-hop inheritance and fallback to legacy TypeConfiguration.instantiation, C-R1-5)
        const effectiveBase = AIEngine.Instance.ResolveEffectiveAgentProperties(baseAgent);
        const instConfig = ResolveAgentInstantiationConfig(
            effectiveBase.Configuration ?? baseAgent.Configuration,
            effectiveBase.TypeConfiguration ?? baseAgent.TypeConfiguration
        );
        const rawMaxPerUser = instConfig?.maxInstancesPerUser;
        const maxPerUser =
            typeof rawMaxPerUser === 'number' && Number.isFinite(rawMaxPerUser) && Math.floor(rawMaxPerUser) >= 1
                ? Math.floor(rawMaxPerUser)
                : null;
        if (maxPerUser != null) {
            const rootBase = AIEngine.Instance.GetRootAgent(baseAgent.ID) ?? baseAgent;
            const existingForRoot = AIEngine.Instance.GetUserDerivedAgents(contextUser).filter((a) => {
                if (
                    a.Status !== 'Active' ||
                    (a.InstantiationMode ?? 'None') !== 'None' ||
                    !UUIDsEqual(a.OwnerUserID, contextUser.ID)
                ) {
                    return false;
                }
                const r = AIEngine.Instance.GetRootAgent(a.ID);
                return r != null && UUIDsEqual(r.ID, rootBase.ID);
            });
            if (existingForRoot.length >= maxPerUser) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Maximum of ${maxPerUser} active personal instances for "${baseAgent.Name}" reached. Archive an existing instance or update one instead.`,
                    Params: params.Params,
                };
            }
        }

        const description = this.getStringParam(params, 'Description');
        const iconClass = this.getStringParam(params, 'IconClass');
        const logoUrl = this.getStringParam(params, 'LogoURL');
        const additionalInstructions = this.getStringParam(params, 'AdditionalInstructions');
        const isPrimary = this.getBooleanParam(params, 'IsPrimaryInstance');
        const personaId = this.getStringParam(params, 'PersonaID');
        const personaName = this.getStringParam(params, 'PersonaName');
        const tone = this.getStringParam(params, 'Tone');
        const speakingStyle = this.getStringParam(params, 'SpeakingStyle');
        const coordinationMode = this.parseCoordinationMode(this.getStringParam(params, 'CoordinationMode'));
        const conversationId =
            this.getStringParam(params, 'ConversationID') ?? this.extractContext(params.Context).ConversationID ?? null;

        const agentEntity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
        agentEntity.NewRecord();
        agentEntity.BaseAgentID = baseAgent.ID;
        agentEntity.OwnerUserID = contextUser.ID;
        agentEntity.Name = rawName;
        agentEntity.Description = description ?? `Personal ${baseAgent.Name} instance`;
        agentEntity.IconClass = iconClass ?? baseAgent.IconClass ?? null;
        agentEntity.LogoURL = logoUrl ?? null;
        agentEntity.AdditionalInstructions = additionalInstructions ?? null;
        agentEntity.InstantiationMode = 'None';
        agentEntity.Status = 'Active';
        if (effectiveBase.TypeID) {
            agentEntity.TypeID = effectiveBase.TypeID;
        } else if (baseAgent.TypeID) {
            agentEntity.TypeID = baseAgent.TypeID;
        }
        if (isPrimary !== null) {
            agentEntity.IsPrimaryInstance = isPrimary;
        }

        const agentSaved = await agentEntity.Save();
        if (!agentSaved) {
            return {
                Success: false,
                ResultCode: 'SAVE_FAILED',
                Message: `Failed to create agent instance "${rawName}": ${agentEntity.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
                Params: params.Params,
            };
        }

        // Refresh AIEngine immediately so MJAIAgentPersonaEntityServer and MJAIAgentUserPolicyEntityServer
        // see the newly minted derived child in cache during sync Validate() / ValidateAsync().
        await AIEngine.Instance.Config(true, contextUser);

        // Attach Persona + StyleOverride when requested
        let resolvedPersona: MJAIPersonaEntity | null = null;
        if (personaId || personaName || tone || speakingStyle) {
            resolvedPersona = this.resolvePersonaEntity(personaId, personaName, baseAgent.ID);
            if (resolvedPersona) {
                const personaResult = await this.upsertDefaultAgentPersona(
                    agentEntity.ID,
                    resolvedPersona.ID,
                    tone,
                    speakingStyle,
                    contextUser,
                    md
                );
                if (!personaResult.success) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: personaResult.errorMessage,
                        Params: params.Params,
                    };
                }
            }
        }

        // Initialize AIAgentUserPolicy when CoordinationMode is passed or base is Chief of Staff
        const rootBase = AIEngine.Instance.GetRootAgent(baseAgent.ID) ?? baseAgent;
        const isChiefOfStaff = rootBase.Name.trim().toLowerCase() === 'chief of staff';
        if (coordinationMode || isChiefOfStaff) {
            const policyResult = await this.upsertUserPolicyForInstance(
                agentEntity.ID,
                agentEntity.Name,
                coordinationMode,
                resolvedPersona?.ID ?? null,
                contextUser,
                md
            );
            if (!policyResult.success) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: policyResult.errorMessage,
                    Params: params.Params,
                };
            }
        }

        // Re-pin the active onboarding conversation so the very next turn runs as the new instance
        let conversationPinned = false;
        if (conversationId) {
            conversationPinned = await this.repinConversationToInstance(
                conversationId,
                agentEntity.ID,
                agentEntity.Name,
                contextUser,
                md
            );
        }

        // Final cache refresh so UI & subsequent turns immediately see the complete instance + persona
        await AIEngine.Instance.Config(true, contextUser);
        AgentUserPolicyEngine.Instance.ClearCache(agentEntity.ID, contextUser.ID);

        const refreshed = AIEngine.Instance.GetAgentByID(agentEntity.ID);
        const summary = this.buildInstanceSummary(refreshed ?? agentEntity, conversationPinned);

        this.setOutputParam(params, 'InstanceAgentID', agentEntity.ID);
        this.setOutputParam(params, 'InstancesJSON', JSON.stringify(summary));

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Created personal ${baseAgent.Name} instance "${agentEntity.Name}" (ID: ${agentEntity.ID})${
                conversationPinned ? ' and switched this conversation to it' : ''
            }.`,
            Params: params.Params,
        };
    }

    private async handleUpdate(
        params: RunActionParams,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<ActionResultSimple> {
        const target = this.resolveOwnedDerivedInstance(params, contextUser);
        if ('errorResult' in target) {
            return target.errorResult;
        }
        const existingAgent = target.agent;

        const entity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
        const loaded = await entity.InnerLoad(CompositeKey.FromID(existingAgent.ID));
        if (!loaded) {
            return {
                Success: false,
                ResultCode: 'AGENT_NOT_FOUND',
                Message: `Failed to load agent instance "${existingAgent.ID}" for update.`,
                Params: params.Params,
            };
        }

        const name = this.getStringParam(params, 'Name');
        const description = this.getStringParam(params, 'Description');
        const iconClass = this.getStringParam(params, 'IconClass');
        const logoUrl = this.getStringParam(params, 'LogoURL');
        const additionalInstructions = this.getStringParam(params, 'AdditionalInstructions');
        const isPrimary = this.getBooleanParam(params, 'IsPrimaryInstance');
        const personaId = this.getStringParam(params, 'PersonaID');
        const personaName = this.getStringParam(params, 'PersonaName');
        const tone = this.getStringParam(params, 'Tone');
        const speakingStyle = this.getStringParam(params, 'SpeakingStyle');
        const coordinationMode = this.parseCoordinationMode(this.getStringParam(params, 'CoordinationMode'));

        let agentDirty = false;
        if (name !== null && name.trim().length > 0) {
            entity.Name = name.trim();
            agentDirty = true;
        }
        if (description !== null) {
            entity.Description = description;
            agentDirty = true;
        }
        if (iconClass !== null) {
            entity.IconClass = iconClass;
            agentDirty = true;
        }
        if (logoUrl !== null) {
            entity.LogoURL = logoUrl;
            agentDirty = true;
        }
        if (additionalInstructions !== null) {
            entity.AdditionalInstructions = additionalInstructions;
            agentDirty = true;
        }
        if (isPrimary !== null) {
            entity.IsPrimaryInstance = isPrimary;
            agentDirty = true;
        }

        if (agentDirty) {
            const saved = await entity.Save();
            if (!saved) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: `Failed to update agent instance "${entity.Name}": ${entity.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
                    Params: params.Params,
                };
            }
        }

        let resolvedPersona: MJAIPersonaEntity | null = null;
        if (personaId || personaName || tone !== null || speakingStyle !== null) {
            resolvedPersona = this.resolvePersonaEntity(personaId, personaName, entity.ID);
            if (resolvedPersona) {
                const personaResult = await this.upsertDefaultAgentPersona(
                    entity.ID,
                    resolvedPersona.ID,
                    tone,
                    speakingStyle,
                    contextUser,
                    md
                );
                if (!personaResult.success) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: personaResult.errorMessage,
                        Params: params.Params,
                    };
                }
            }
        }

        if (coordinationMode || name !== null || resolvedPersona) {
            const existingPolicy = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                entity.ID,
                contextUser.ID,
                contextUser,
                { forceRefresh: true, provider: md }
            );
            if (existingPolicy.status === 'found' && existingPolicy.policy) {
                const policyResult = await this.upsertUserPolicyForInstance(
                    entity.ID,
                    entity.Name,
                    coordinationMode,
                    resolvedPersona?.ID ?? null,
                    contextUser,
                    md
                );
                if (!policyResult.success) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: policyResult.errorMessage,
                        Params: params.Params,
                    };
                }
            } else if (coordinationMode) {
                const policyResult = await this.upsertUserPolicyForInstance(
                    entity.ID,
                    entity.Name,
                    coordinationMode,
                    resolvedPersona?.ID ?? null,
                    contextUser,
                    md
                );
                if (!policyResult.success) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: policyResult.errorMessage,
                        Params: params.Params,
                    };
                }
            }
        }

        await AIEngine.Instance.Config(true, contextUser);
        AgentUserPolicyEngine.Instance.ClearCache(entity.ID, contextUser.ID);

        const refreshed = AIEngine.Instance.GetAgentByID(entity.ID);
        const summary = this.buildInstanceSummary(refreshed ?? entity, false);

        this.setOutputParam(params, 'InstanceAgentID', entity.ID);
        this.setOutputParam(params, 'InstancesJSON', JSON.stringify(summary));

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Updated agent instance "${entity.Name}" (ID: ${entity.ID}).`,
            Params: params.Params,
        };
    }

    private handleListMine(params: RunActionParams, contextUser: UserInfo): ActionResultSimple {
        const baseIdFilter = this.getStringParam(params, 'BaseAgentID');
        const baseNameFilter = this.getStringParam(params, 'BaseAgentName')?.trim().toLowerCase() ?? null;

        let instances = AIEngine.Instance.GetUserDerivedAgents(contextUser);
        if (baseIdFilter) {
            instances = instances.filter((agent) => {
                const chain = AIEngine.Instance.GetAgentInheritanceChain(agent.ID);
                const ancestorIds = new UUIDSet(chain.slice(0, -1).map((ancestor) => ancestor.ID));
                return ancestorIds.Has(baseIdFilter);
            });
        } else if (baseNameFilter) {
            instances = instances.filter((agent) => {
                const chain = AIEngine.Instance.GetAgentInheritanceChain(agent.ID);
                return chain.slice(0, -1).some((ancestor) => ancestor.Name.trim().toLowerCase() === baseNameFilter);
            });
        }

        const summaries = instances.map((agent) => this.buildInstanceSummary(agent, false));
        this.setOutputParam(params, 'InstancesJSON', JSON.stringify(summaries));

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Found ${summaries.length} personal or shared agent instance(s).`,
            Params: params.Params,
        };
    }

    private async handleSetPrimary(
        params: RunActionParams,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<ActionResultSimple> {
        const target = this.resolveOwnedDerivedInstance(params, contextUser);
        if ('errorResult' in target) {
            return target.errorResult;
        }
        const existingAgent = target.agent;

        const entity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
        const loaded = await entity.InnerLoad(CompositeKey.FromID(existingAgent.ID));
        if (!loaded) {
            return {
                Success: false,
                ResultCode: 'AGENT_NOT_FOUND',
                Message: `Failed to load agent instance "${existingAgent.ID}".`,
                Params: params.Params,
            };
        }

        entity.IsPrimaryInstance = true;
        const saved = await entity.Save();
        if (!saved) {
            return {
                Success: false,
                ResultCode: 'SAVE_FAILED',
                Message: `Failed to promote "${entity.Name}" to primary: ${entity.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
                Params: params.Params,
            };
        }

        await AIEngine.Instance.Config(true, contextUser);
        const refreshed = AIEngine.Instance.GetAgentByID(entity.ID);
        const summary = this.buildInstanceSummary(refreshed ?? entity, false);

        this.setOutputParam(params, 'InstanceAgentID', entity.ID);
        this.setOutputParam(params, 'InstancesJSON', JSON.stringify(summary));

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `"${entity.Name}" is now your primary instance.`,
            Params: params.Params,
        };
    }

    private async handleArchive(
        params: RunActionParams,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<ActionResultSimple> {
        const target = this.resolveOwnedDerivedInstance(params, contextUser);
        if ('errorResult' in target) {
            return target.errorResult;
        }
        const existingAgent = target.agent;

        const entity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
        const loaded = await entity.InnerLoad(CompositeKey.FromID(existingAgent.ID));
        if (!loaded) {
            return {
                Success: false,
                ResultCode: 'AGENT_NOT_FOUND',
                Message: `Failed to load agent instance "${existingAgent.ID}".`,
                Params: params.Params,
            };
        }

        entity.Status = 'Disabled';
        entity.IsPrimaryInstance = false;
        const saved = await entity.Save();
        if (!saved) {
            return {
                Success: false,
                ResultCode: 'SAVE_FAILED',
                Message: `Failed to archive "${entity.Name}": ${entity.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
                Params: params.Params,
            };
        }

        await AIEngine.Instance.Config(true, contextUser);
        const summary = this.buildInstanceSummary(entity, false);

        this.setOutputParam(params, 'InstanceAgentID', entity.ID);
        this.setOutputParam(params, 'InstancesJSON', JSON.stringify(summary));

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Archived agent instance "${entity.Name}" (ID: ${entity.ID}).`,
            Params: params.Params,
        };
    }

    private resolveBaseAgentForCreate(params: RunActionParams): MJAIAgentEntityExtended | undefined {
        const baseAgentId = this.getStringParam(params, 'BaseAgentID');
        if (baseAgentId) {
            return AIEngine.Instance.GetAgentByID(baseAgentId);
        }

        const baseAgentName = this.getStringParam(params, 'BaseAgentName');
        if (baseAgentName) {
            const norm = baseAgentName.trim().toLowerCase();
            // Prefer root/template agents matching BaseAgentName
            const rootMatch = AIEngine.Instance.Agents.find(
                (a) => !a.BaseAgentID && a.Status === 'Active' && a.Name.trim().toLowerCase() === norm
            );
            if (rootMatch) {
                return rootMatch;
            }
            return AIEngine.Instance.Agents.find(
                (a) => a.Status === 'Active' && a.Name.trim().toLowerCase() === norm
            );
        }

        const contextAgentId =
            this.extractContext(params.Context).AgentID ?? AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID();
        if (contextAgentId) {
            const executing = AIEngine.Instance.GetAgentByID(contextAgentId);
            if (executing) {
                if (executing.InstantiationMode !== 'None') {
                    return executing;
                }
                if (executing.BaseAgentID) {
                    const root = AIEngine.Instance.GetRootAgent(executing.ID);
                    if (root && root.InstantiationMode !== 'None') {
                        return root;
                    }
                }
            }
        }

        return undefined;
    }

    private resolveOwnedDerivedInstance(
        params: RunActionParams,
        contextUser: UserInfo
    ): { agent: MJAIAgentEntityExtended } | { errorResult: ActionResultSimple } {
        const explicitId = this.getStringParam(params, 'InstanceAgentID');
        const contextAgentId =
            this.extractContext(params.Context).AgentID ?? AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID();
        const nameHint = this.getStringParam(params, 'Name')?.trim().toLowerCase() ?? null;

        let candidate: MJAIAgentEntityExtended | undefined;
        if (explicitId) {
            candidate = AIEngine.Instance.GetAgentByID(explicitId);
        } else if (contextAgentId) {
            const ctxAgent = AIEngine.Instance.GetAgentByID(contextAgentId);
            if (ctxAgent?.BaseAgentID) {
                candidate = ctxAgent;
            }
        }

        if (!candidate && !explicitId && nameHint) {
            candidate = AIEngine.Instance.Agents.find(
                (a) =>
                    Boolean(a.BaseAgentID) &&
                    UUIDsEqual(a.OwnerUserID, contextUser.ID) &&
                    a.Name.trim().toLowerCase() === nameHint
            );
        }

        if (!candidate) {
            return {
                errorResult: {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: 'Could not find the target personal agent instance. Provide InstanceAgentID.',
                    Params: params.Params,
                },
            };
        }

        if (!candidate.BaseAgentID) {
            return {
                errorResult: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `"${candidate.Name}" is a root/template agent, not a personal derived instance.`,
                    Params: params.Params,
                },
            };
        }

        if (!UUIDsEqual(candidate.OwnerUserID, contextUser.ID) && contextUser.Type !== 'Owner') {
            return {
                errorResult: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `You can only modify your own derived agent instances; "${candidate.Name}" belongs to another user.`,
                    Params: params.Params,
                },
            };
        }

        return { agent: candidate };
    }

    private resolvePersonaEntity(
        personaId: string | null,
        personaName: string | null,
        fallbackAgentId: string
    ): MJAIPersonaEntity | null {
        const personas = AIEngine.Instance.Personas ?? [];
        if (personaId) {
            const match = personas.find((p) => UUIDsEqual(p.ID, personaId));
            if (match) {
                return match;
            }
        }
        if (personaName) {
            const norm = personaName.trim().toLowerCase();
            const match = personas.find((p) => p.Name.trim().toLowerCase() === norm && p.IsActive !== false);
            if (match) {
                return match;
            }
        }
        const inherited = AIEngine.Instance.ResolveAgentPersona(fallbackAgentId);
        if (inherited?.Persona) {
            return inherited.Persona;
        }
        const sage = personas.find((p) => p.IsActive !== false && p.Name.trim().toLowerCase() === 'sage');
        return sage ?? personas.find((p) => p.IsActive !== false) ?? null;
    }

    private async upsertDefaultAgentPersona(
        agentId: string,
        personaId: string,
        tone: string | null,
        speakingStyle: string | null,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<{ success: boolean; errorMessage: string }> {
        const rv = RunView.FromMetadataProvider(md);
        const existingRes = await rv.RunView<MJAIAgentPersonaEntity>(
            {
                EntityName: 'MJ: AI Agent Personas',
                ExtraFilter: `AgentID='${agentId}' AND IsDefault=1`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser
        );
        let link: MJAIAgentPersonaEntity;
        if (existingRes.Success && existingRes.Results.length > 0) {
            link = existingRes.Results[0];
        } else {
            link = await md.GetEntityObject<MJAIAgentPersonaEntity>('MJ: AI Agent Personas', contextUser);
            link.NewRecord();
            link.AgentID = agentId;
            link.IsDefault = true;
            link.IsAllowed = true;
            link.Sequence = 10;
        }

        link.PersonaID = personaId;
        const currentStyle: MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride = link.StyleOverrideObject
            ? { ...link.StyleOverrideObject }
            : {};
        if (tone !== null) {
            currentStyle.Tone = tone;
        }
        if (speakingStyle !== null) {
            currentStyle.SpeakingStyle = speakingStyle;
        }
        if (currentStyle.Tone || currentStyle.SpeakingStyle || currentStyle.Visual) {
            link.StyleOverrideObject = currentStyle;
        }

        const saved = await link.Save();
        if (!saved) {
            return {
                success: false,
                errorMessage: `Failed to save agent persona configuration: ${link.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
            };
        }
        return { success: true, errorMessage: '' };
    }

    private async upsertUserPolicyForInstance(
        agentId: string,
        displayName: string,
        coordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'] | null,
        preferredPersonaId: string | null,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<{ success: boolean; errorMessage: string }> {
        const lookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
            agentId,
            contextUser.ID,
            contextUser,
            { forceRefresh: true, provider: md }
        );
        const policy = await md.GetEntityObject<MJAIAgentUserPolicyEntity>(
            'MJ: AI Agent User Policies',
            contextUser
        );
        if (lookup.status === 'found' && lookup.policy) {
            const loaded = await policy.InnerLoad(CompositeKey.FromID(lookup.policy.ID));
            if (!loaded) {
                return { success: false, errorMessage: `Failed to load user policy for agent "${agentId}".` };
            }
        } else {
            policy.NewRecord();
            policy.AgentID = agentId;
            policy.UserID = contextUser.ID;
            ApplyDefaultAgentUserPolicyValues(policy);
            policy.OnboardingStatus = 'Completed';
            policy.OnboardedAt = new Date();
        }

        policy.DisplayNameOverride = displayName;
        if (preferredPersonaId) {
            policy.PreferredPersonaID = preferredPersonaId;
        }
        if (coordinationMode) {
            policy.CoordinationMode = coordinationMode;
        }

        const saved = await policy.Save();
        if (!saved) {
            return {
                success: false,
                errorMessage: `Failed to save agent user policy: ${policy.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
            };
        }
        AgentUserPolicyEngine.Instance.SetCachedPolicy(policy);
        return { success: true, errorMessage: '' };
    }

    private async repinConversationToInstance(
        conversationId: string,
        newAgentId: string,
        newAgentName: string,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<boolean> {
        try {
            const conv = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
            const loaded = await conv.InnerLoad(CompositeKey.FromID(conversationId));
            if (!loaded) {
                return false;
            }
            if (conv.UserID && !UUIDsEqual(conv.UserID, contextUser.ID) && contextUser.Type !== 'Owner') {
                return false;
            }
            conv.DefaultAgentID = newAgentId;
            const currentName = (conv.Name ?? '').trim().toLowerCase();
            if (!currentName || currentName === 'new chat' || currentName === 'chief of staff') {
                conv.Name = `Chat with ${newAgentName}`;
            }
            return await conv.Save();
        } catch (error) {
            LogError(
                `ManageMyAgentInstanceAction: unable to re-pin conversation "${conversationId}": ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return false;
        }
    }

    private buildInstanceSummary(agent: MJAIAgentEntity, conversationPinned: boolean): AgentInstanceSummary {
        const baseAgent = agent.BaseAgentID ? AIEngine.Instance.GetAgentByID(agent.BaseAgentID) : undefined;
        const effectivePersona = AIEngine.Instance.ResolveAgentPersona(agent.ID);
        return {
            ID: agent.ID,
            Name: agent.Name,
            Description: agent.Description ?? null,
            BaseAgentID: agent.BaseAgentID ?? null,
            BaseAgentName: baseAgent?.Name ?? null,
            IconClass: agent.IconClass ?? null,
            LogoURL: agent.LogoURL ?? null,
            IsPrimaryInstance: Boolean(agent.IsPrimaryInstance),
            AdditionalInstructions: agent.AdditionalInstructions ?? null,
            Status: agent.Status,
            PersonaID: effectivePersona?.Persona?.ID ?? null,
            PersonaName: effectivePersona?.Persona?.Name ?? null,
            Tone: effectivePersona?.Tone ?? null,
            SpeakingStyle: effectivePersona?.SpeakingStyle ?? null,
            ConversationPinned: conversationPinned,
        };
    }

    private parseOperation(raw: string | null): ManageInstanceOperation | null {
        if (!raw) {
            return null;
        }
        const normalized = raw.trim().toLowerCase();
        switch (normalized) {
            case 'create':
                return 'Create';
            case 'update':
                return 'Update';
            case 'listmine':
            case 'list_mine':
            case 'list':
                return 'ListMine';
            case 'setprimary':
            case 'set_primary':
                return 'SetPrimary';
            case 'archive':
            case 'disable':
                return 'Archive';
            default:
                return null;
        }
    }

    private parseCoordinationMode(
        raw: string | null
    ): MJAIAgentUserPolicyEntity['CoordinationMode'] | null {
        if (!raw) {
            return null;
        }
        const normalized = raw.trim().toLowerCase();
        if (normalized === 'observer') return 'Observer';
        if (normalized === 'coordinator') return 'Coordinator';
        if (normalized === 'autonomous') return 'Autonomous';
        return null;
    }

    private extractContext(context: RunActionParams['Context']): ActionExecutionContext {
        if (!context || typeof context !== 'object') {
            return {};
        }
        const rec = context as ActionExecutionContext;
        return {
            AgentID: typeof rec.AgentID === 'string' && rec.AgentID.trim() ? rec.AgentID.trim() : undefined,
            AgentName: typeof rec.AgentName === 'string' && rec.AgentName.trim() ? rec.AgentName.trim() : undefined,
            ConversationID:
                typeof rec.ConversationID === 'string' && rec.ConversationID.trim()
                    ? rec.ConversationID.trim()
                    : undefined,
        };
    }

    private getStringParam(params: RunActionParams, name: string): string | null {
        const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (found?.Value == null) {
            return null;
        }
        const s = String(found.Value);
        return s.length > 0 ? s : null;
    }

    private getBooleanParam(params: RunActionParams, name: string): boolean | null {
        const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (found?.Value == null) {
            return null;
        }
        if (typeof found.Value === 'boolean') {
            return found.Value;
        }
        const str = String(found.Value).trim().toLowerCase();
        if (str === 'true' || str === '1' || str === 'yes') return true;
        if (str === 'false' || str === '0' || str === 'no') return false;
        return null;
    }

    private setOutputParam(params: RunActionParams, name: string, value: string): void {
        const existing = params.Params.find(
            (p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase() && (p.Type === 'Output' || p.Type === 'Both')
        );
        if (existing) {
            existing.Value = value;
            return;
        }
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }
}
