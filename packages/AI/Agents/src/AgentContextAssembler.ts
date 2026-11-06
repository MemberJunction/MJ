/**
 * @fileoverview Extracted prompt context assembly, catalog markdown formatting,
 * and trailing `<mj-runtime-state>` message construction for {@link BaseAgent}.
 *
 * Isolates prompt template data formatting (sub-agents, actions, skills, client tools,
 * application context), response-type auto-alignment, and cache-aware runtime-state
 * message assembly into an independently testable collaborator (`WS-4.5b`).
 *
 * @module @memberjunction/ai-agents
 */

import {
    MJAIAgentEntityExtended,
    MJAIPromptEntityExtended,
    MJAIModelEntityExtended,
    AIPromptParams,
    AgentChatMessage,
    BoundActionParams,
    ClientToolMetadata,
    ResolveClientTools,
    SystemPlaceholderManager,
} from '@memberjunction/ai-core-plus';
import {
    MJActionParamEntity,
    MJAISkillEntity,
    MJAIVendorEntity,
    MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import { MJActionEntityExtended } from '@memberjunction/actions-base';
import { BaseLLM, ChatMessage, IsPrefixPromptCache } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { UserInfo, LogError } from '@memberjunction/core';
import { IsPlainObject, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';
import { DescribeValueSchemaInline, GetStoredValueSchema } from './native-tools/action-param-schema';
import { BindingsForAction, UnboundParams } from './bound-action-params';
import {
    EscapeRuntimeStateTagsInMessage,
    RuntimeStateDateTime,
    RuntimeStateFragmentBuilder,
    RuntimeStateScratchpad,
} from './runtime-state-fragment';
import {
    CURRENT_DATE_PLACEHOLDER,
    CURRENT_DAY_OF_WEEK_PLACEHOLDER,
    CURRENT_TIME_PLACEHOLDER,
    RUNTIME_STATE_TAG,
    SCRATCHPAD_NOTES_PLACEHOLDER,
    SCRATCHPAD_TASKS_PLACEHOLDER,
    SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER,
    VOLATILE_TEMPLATE_MARKERS,
} from './constants';
import { ResolveFinishIfMode } from './agent-types/loop-agent-prompt-params';
import { ClientToolRequestManager } from './ClientToolRequestManager';

/**
 * Input options for {@link AgentContextAssembler.BuildRuntimeStateFragment}.
 */
export interface BuildRuntimeStateFragmentInput<P = unknown> {
    DateTime: RuntimeStateDateTime | null;
    Scratchpad: RuntimeStateScratchpad | null;
    Payload: P;
    IncludePayload: boolean;
    Specialization: string | null;
}

/**
 * Coordinates prompt context assembly, catalog markdown generation, and
 * cache-preserving `<mj-runtime-state>` trailing message construction for `BaseAgent`.
 */
export class AgentContextAssembler {
    private cachedTemplatesArrayRef: MJTemplateEntityExtended[] | null = null;
    private templateByIdMap: Map<string, MJTemplateEntityExtended> | null = null;
    private lastRuntimeStateDeliveryCache: {
        templateText: string;
        markers: readonly string[];
        delivery: 'trailing' | 'embedded' | 'unsupported';
    } | null = null;

    /**
     * Assembles the outgoing message array for a single LLM request under `'trailingMessage'`
     * runtime-state placement: escapes literal `<mj-runtime-state>` tags in non-system history
     * messages and appends the fresh volatile-state fragment last.
     */
    public AssembleOutgoingMessages(
        history: ChatMessage[],
        fragment: AgentChatMessage,
        isAppendOnly: boolean = false
    ): ChatMessage[] {
        const source = isAppendOnly
            ? history
            : history.filter((m) => !(m as AgentChatMessage).metadata?.volatileState);
        const sanitized = source.map((m) =>
            m.role === 'system' || (m as AgentChatMessage).metadata?.volatileState
                ? m
                : EscapeRuntimeStateTagsInMessage(m)
        );
        return [...sanitized, fragment];
    }

    /**
     * Determines whether the run should retain prior runtime-state fragments in append-only mode
     * (either because the model/vendor uses a byte-prefix prompt cache or because native tool calls
     * are active on a driver whose replayed reasoning requires an unchanged prefix).
     */
    public ResolveAppendOnlyState(
        model: MJAIModelEntityExtended | undefined,
        vendor: MJAIVendorEntity | undefined,
        hasNativeToolBindings: boolean,
        prefixPromptCacheOverride?: boolean
    ): boolean {
        const isPrefixCache = prefixPromptCacheOverride ?? this.ResolvePrefixPromptCache(model, vendor);
        if (isPrefixCache) {
            return true;
        }
        return hasNativeToolBindings && this.DriverRequiresStableReasoningPrefix(model, vendor);
    }

    /**
     * Returns true when the driver serving `model` on `vendor` binds replayed reasoning
     * to the unchanged history prefix before it.
     */
    public DriverRequiresStableReasoningPrefix(
        model: MJAIModelEntityExtended | undefined,
        vendor: MJAIVendorEntity | undefined
    ): boolean {
        if (!model || !vendor) {
            return false;
        }
        const engine = AIEngine.Instance;
        const modelVendor = (engine.ModelVendorsByModelID?.get(NormalizeUUID(model.ID)) ?? []).find(
            (mv) => UUIDsEqual(mv.VendorID, vendor.ID) && engine.IsInferenceProvider(mv)
        );
        if (!modelVendor?.DriverClass) {
            return false;
        }
        const driver = MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, modelVendor.DriverClass)
            ?.SubClass as typeof BaseLLM | undefined;
        return driver?.ReplayedReasoningRequiresStablePrefix === true;
    }

    /**
     * Determines whether `model` (as served by `vendor`) sits behind a byte-prefix prompt cache
     * (`LLM.PrefixPromptCache`) from the model catalog's `ModelConfiguration` cascade.
     */
    public ResolvePrefixPromptCache(
        model: MJAIModelEntityExtended | undefined,
        vendor: MJAIVendorEntity | undefined
    ): boolean {
        if (!model) {
            return false;
        }
        const engine = AIEngine.Instance;
        const modelVendor = vendor
            ? (engine.ModelVendorsByModelID?.get(NormalizeUUID(model.ID)) ?? []).find(
                  (mv) => UUIDsEqual(mv.VendorID, vendor.ID) && engine.IsInferenceProvider(mv)
              )
            : undefined;
        return IsPrefixPromptCache(engine.GetEffectiveModelConfiguration(model.ID, modelVendor?.ID));
    }

    /**
     * Returns true when unrendered template text contains any volatile state marker
     * (indicating the template still embeds volatile state directly).
     */
    public TemplateTextEmbedsVolatileState(
        templateText: string,
        markers: readonly string[] = VOLATILE_TEMPLATE_MARKERS
    ): boolean {
        return markers.some((marker) => templateText.includes(marker));
    }

    /**
     * Classifies how a system prompt template handles `<mj-runtime-state>` delivery from its
     * unrendered template text.
     */
    public ClassifyRuntimeStateDelivery(
        templateText: string | null,
        markers: readonly string[] = VOLATILE_TEMPLATE_MARKERS
    ): 'trailing' | 'embedded' | 'unsupported' | 'unknown' {
        if (templateText === null) {
            return 'unknown';
        }
        if (
            this.lastRuntimeStateDeliveryCache &&
            this.lastRuntimeStateDeliveryCache.templateText === templateText &&
            this.lastRuntimeStateDeliveryCache.markers === markers
        ) {
            return this.lastRuntimeStateDeliveryCache.delivery;
        }
        const delivery: 'trailing' | 'embedded' | 'unsupported' = this.TemplateTextEmbedsVolatileState(
            templateText,
            markers
        )
            ? 'embedded'
            : templateText.includes(`<${RUNTIME_STATE_TAG}>`)
              ? 'trailing'
              : 'unsupported';
        this.lastRuntimeStateDeliveryCache = { templateText, markers, delivery };
        return delivery;
    }

    /**
     * Loads the raw (unrendered) template text for an AI prompt from `TemplateEngineServer`.
     */
    public async LoadPromptTemplateText(
        prompt: MJAIPromptEntityExtended | undefined,
        contextUser: UserInfo,
        ensureEngineConfigured: boolean = true
    ): Promise<string | null> {
        if (!prompt?.TemplateID) {
            return null;
        }
        if (ensureEngineConfigured) {
            await TemplateEngineServer.Instance.Config(false, contextUser);
        }
        const templates = TemplateEngineServer.Instance.Templates;
        if (!templates) {
            return null;
        }
        let template: MJTemplateEntityExtended | undefined;
        if (templates === this.cachedTemplatesArrayRef && this.templateByIdMap) {
            template = this.templateByIdMap.get(NormalizeUUID(prompt.TemplateID));
        } else {
            this.cachedTemplatesArrayRef = templates;
            const map = new Map<string, MJTemplateEntityExtended>();
            for (const t of templates) {
                if (t?.ID) {
                    map.set(NormalizeUUID(t.ID), t);
                }
            }
            this.templateByIdMap = map;
            template = map.get(NormalizeUUID(prompt.TemplateID));
        }
        return template?.GetHighestPriorityContent()?.TemplateText ?? null;
    }

    /**
     * Resolves the three temporal placeholders (`_CURRENT_DATE`, `_CURRENT_DAY_OF_WEEK`, `_CURRENT_TIME`)
     * for the trailing runtime-state fragment.
     */
    public async ResolveFragmentDateTime(
        promptParams: AIPromptParams,
        onError?: (error: Error | string, placeholderName: string) => void
    ): Promise<RuntimeStateDateTime | null> {
        const resolve = async (name: string): Promise<string | null> => {
            const placeholder = SystemPlaceholderManager.getPlaceholders().find((p) => p.name === name);
            if (!placeholder) {
                return null;
            }
            try {
                const value = await placeholder.getValue(promptParams);
                return value == null ? null : String(value);
            } catch (e: unknown) {
                onError?.(e instanceof Error ? e : String(e), name);
                return null;
            }
        };
        const [date, dayOfWeek, time] = await Promise.all([
            resolve(CURRENT_DATE_PLACEHOLDER),
            resolve(CURRENT_DAY_OF_WEEK_PLACEHOLDER),
            resolve(CURRENT_TIME_PLACEHOLDER),
        ]);
        if (!date || !dayOfWeek || !time) {
            return null;
        }
        return { Date: date, DayOfWeek: dayOfWeek, Time: time };
    }

    /**
     * Reads scratchpad notes, tasks, and task summary from prepared prompt template data.
     */
    public ReadScratchpadFromTemplateData(data: Record<string, unknown>): RuntimeStateScratchpad | null {
        const notes = data[SCRATCHPAD_NOTES_PLACEHOLDER];
        const tasks = data[SCRATCHPAD_TASKS_PLACEHOLDER];
        const summary = data[SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER];
        if (typeof notes !== 'string' || typeof tasks !== 'string' || typeof summary !== 'string') {
            return null;
        }
        return { Notes: notes, Tasks: tasks, TaskSummary: summary };
    }

    /**
     * Builds the serialized `<mj-runtime-state>` XML block from resolved date/time, scratchpad,
     * payload, and optional relocated specialization.
     */
    public BuildRuntimeStateFragment<P>(input: BuildRuntimeStateFragmentInput<P>): string | null {
        return new RuntimeStateFragmentBuilder().Build({
            DateTime: input.DateTime,
            Scratchpad: input.Scratchpad,
            Payload: input.IncludePayload ? { Value: input.Payload || {} } : null,
            Specialization: input.Specialization,
        });
    }

    /**
     * Formats sub-agent details as compact markdown for inclusion in prompt context.
     */
    public FormatSubAgentDetails(subAgents: MJAIAgentEntityExtended[]): string {
        return subAgents
            .map((sa) => {
                let line = `- **${sa.Name}** — ${sa.Description}`;
                if (sa.ExecutionMode !== 'Sequential') {
                    line += ` _(${sa.ExecutionMode}, order: ${sa.ExecutionOrder})_`;
                }
                const presets = AIEngine.Instance.GetAgentConfigurationPresets(sa.ID, true);
                if (presets.length > 0) {
                    const presetSummary = presets
                        .map((p) => {
                            const desc = p.Description?.trim();
                            if (p.IsDefault && desc) {
                                return `${p.Name} (default: ${desc})`;
                            }
                            if (p.IsDefault) {
                                return `${p.Name} (default)`;
                            }
                            if (desc) {
                                return `${p.Name} (${desc})`;
                            }
                            return p.Name;
                        })
                        .join(', ');
                    line += `\n  Presets: ${presetSummary}`;
                }
                return line;
            })
            .join('\n');
    }

    /**
     * Formats the skill catalog as compact markdown (name + description only for progressive disclosure).
     */
    public FormatSkillsCatalog(skills: MJAISkillEntity[]): string {
        return skills.map((s) => `- **${s.Name}** — ${s.Description ?? '(no description)'}`).join('\n');
    }

    /**
     * Formats action details as compact markdown for inclusion in prompt context, omitting
     * any parameters bound by `boundActionParams`.
     */
    public FormatActionDetails(
        actions: MJActionEntityExtended[],
        boundActionParams?: BoundActionParams
    ): string {
        return actions
            .map((action) => {
                const lines: string[] = [];
                lines.push(`### ${action.Name}`);
                lines.push(action.Description);

                const visibleParams = UnboundParams(
                    action.Params.Items,
                    BindingsForAction(boundActionParams, action.ID)
                );
                const inputParams = visibleParams.filter((p) => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'input' || t === 'both';
                });
                const outputParams = visibleParams.filter((p) => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'output' || t === 'both';
                });

                if (inputParams.length > 0) {
                    lines.push(
                        `**Input:** ${inputParams.map((p) => this.FormatActionParameter(p)).join(', ')}`
                    );
                }
                if (outputParams.length > 0) {
                    lines.push(
                        `**Output:** ${outputParams.map((p) => this.FormatActionParameter(p)).join(', ')}`
                    );
                }

                if (action.ResultCodes.Items.length > 0) {
                    const rcParts = action.ResultCodes.Items.map((rc) => {
                        const marker = rc.IsSuccess ? '✓' : '✗';
                        const desc =
                            rc.Description && rc.Description.toLowerCase() !== rc.ResultCode.toLowerCase()
                                ? ` ${rc.Description}`
                                : '';
                        return `${rc.ResultCode} ${marker}${desc}`;
                    });
                    lines.push(`**Results:** ${rcParts.join(' · ')}`);
                }

                return lines.join('\n');
            })
            .join('\n\n');
    }

    /**
     * Formats a single action parameter as a compact inline markdown string.
     */
    public FormatActionParameter(param: MJActionParamEntity): string {
        const requiredMarker = param.IsRequired ? '\\*' : '';
        const parts: string[] = [];

        if (param.IsArray) {
            parts.push('array');
        }

        const valueSchema = GetStoredValueSchema(param);
        const vt = param.ValueType?.trim();
        if (valueSchema) {
            parts.push(DescribeValueSchemaInline(valueSchema));
        } else if (vt && vt !== 'Scalar' && vt !== 'Other') {
            parts.push(vt);
        }

        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';

        let defaultStr = '';
        if (param.DefaultValue != null && param.DefaultValue !== '') {
            defaultStr = ` (default: ${JSON.stringify(param.DefaultValue)})`;
        }

        const desc = param.Description ? ` — ${param.Description}` : '';
        return `\`${param.Name}\`${requiredMarker}${suffix}${desc}${defaultStr}`;
    }

    /**
     * Builds the client tool prompt section for system prompt injection across static,
     * session, app, and override tiers.
     */
    public BuildClientToolPromptSection(
        agent: MJAIAgentEntityExtended,
        extraData?: Record<string, unknown>
    ): string {
        const engine = AIEngine.Instance;
        const staticTools: ClientToolMetadata[] = engine.GetClientToolsForAgent(agent.ID).map((tool) => ({
            Name: tool.Name,
            Description: tool.Description,
            InputSchema: tool.InputSchemaJSON ? JSON.parse(tool.InputSchemaJSON) : {},
            OutputSchema: tool.OutputSchemaJSON ? JSON.parse(tool.OutputSchemaJSON) : undefined,
            Category: tool.Category || undefined,
            DefaultTimeoutMs: tool.DefaultTimeoutMs || undefined,
        }));

        const sessionID = extraData?.sessionID as string | undefined;
        const sessionTools = sessionID ? ClientToolRequestManager.Instance.GetSessionTools(sessionID) : [];

        const appContext = extraData?.appContext as
            | { Capabilities?: { Tools?: ClientToolMetadata[] } }
            | undefined;
        const appTools = appContext?.Capabilities?.Tools ?? [];

        const overrideTools = (extraData?.clientTools as ClientToolMetadata[] | undefined) ?? [];

        const tools = ResolveClientTools({
            agentId: agent.ID,
            staticTools,
            sessionTools,
            appTools,
            overrideTools,
        });

        if (tools.length === 0) {
            return '';
        }

        const lines: string[] = [];
        lines.push("### Client Tools (execute in the user's browser)");
        lines.push(
            "Client tools run in the user's browser and interact with the UI. Use these when you need"
        );
        lines.push(
            'to navigate the user somewhere, display a specific view, switch dashboard tabs, or show'
        );
        lines.push('records. When you choose client tools, set nextStep.type to "ClientTools".');
        lines.push('');
        lines.push('NOTE: Do NOT use client tools for asking the user questions or collecting input.');
        lines.push(
            'Use the "Chat" step for that. Client tools read and change the user\'s UI; some return an image.'
        );
        lines.push('');

        for (const tool of tools) {
            const categoryTag = tool.Category ? ` [${tool.Category}]` : '';
            lines.push(`- **${tool.Name}**${categoryTag}: ${tool.Description}`);

            const props = (tool.InputSchema as Record<string, unknown>)?.properties as
                | Record<string, Record<string, unknown>>
                | undefined;
            const required = (tool.InputSchema as Record<string, unknown>)?.required as string[] | undefined;
            if (props) {
                const paramParts = Object.entries(props).map(([name, schema]) => {
                    const req = required?.includes(name) ? '\\*' : '';
                    const desc = schema.description ? ` — ${schema.description}` : '';
                    return `\`${name}\`${req}${desc}`;
                });
                lines.push(`  Inputs: ${paramParts.join(', ')}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Builds the current application context markdown section from `extraData.appContext`.
     */
    public BuildAppContextSection(extraData?: Record<string, unknown>): string {
        const ctx = extraData?.appContext as Record<string, unknown> | undefined;
        if (!ctx) return '';

        const app = ctx['App'] as { Name?: string; Description?: string } | undefined;
        const activeNav = ctx['ActiveNavItem'] as
            | { Name?: string; Description?: string; ResourceType?: string }
            | undefined;
        const otherNavs = ctx['OtherNavItems'] as Array<{ Name?: string; Description?: string }> | undefined;
        const user = ctx['User'] as { Name?: string; Roles?: string[] } | undefined;

        if (!app?.Name) return '';

        const lines: string[] = [];
        lines.push('### Current Application Context');
        lines.push(
            `The user is currently in the **${app.Name}** application${app.Description ? ` — ${app.Description}` : ''}.`
        );

        if (activeNav?.Name) {
            lines.push('');
            lines.push(
                `**Active view:** ${activeNav.Name}${activeNav.Description ? ` — ${activeNav.Description}` : ''}${activeNav.ResourceType ? ` (${activeNav.ResourceType})` : ''}`
            );
        }

        if (otherNavs && otherNavs.length > 0) {
            lines.push('');
            lines.push('**Other views available in this app:**');
            for (const nav of otherNavs) {
                lines.push(`- ${nav.Name}${nav.Description ? ` — ${nav.Description}` : ''}`);
            }
        }

        if (user?.Name) {
            lines.push('');
            lines.push(`**User:** ${user.Name}${user.Roles?.length ? ` (Roles: ${user.Roles.join(', ')})` : ''}`);
        }

        const dashboardCtx = ctx['AdditionalContext'] as Record<string, unknown> | undefined;
        if (dashboardCtx && Object.keys(dashboardCtx).length > 0) {
            lines.push('');
            lines.push('**Dashboard state:**');
            for (const [key, value] of Object.entries(dashboardCtx)) {
                if (value === null || value === undefined) continue;
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                lines.push(`- ${key}: ${displayValue}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Extracts default values from an agent type's JSON Schema `PromptParamsSchema`.
     */
    public ExtractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown> {
        if (!schemaJson) return {};

        try {
            const schema = JSON.parse(schemaJson) as { properties?: Record<string, { default?: unknown }> };
            const defaults: Record<string, unknown> = {};

            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    if (prop.default !== undefined) {
                        defaults[key] = prop.default;
                    }
                }
            }

            return defaults;
        } catch (e: unknown) {
            LogError(`Failed to parse PromptParamsSchema: ${e instanceof Error ? e.message : String(e)}`);
            return {};
        }
    }

    /**
     * Applies auto-alignment rules to `includeResponseTypeDefinition` based on documentation
     * and capability flags on `params`.
     */
    public ApplyResponseTypeAutoAlignment(
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>,
        decisionsEnabled: boolean = params.decisionsEnabled === true
    ): void {
        if (IsPlainObject(params.includeResponseTypeDefinition)) {
            params.includeResponseTypeDefinition = { ...params.includeResponseTypeDefinition };
        } else if (
            !params.includeResponseTypeDefinition ||
            typeof params.includeResponseTypeDefinition !== 'object'
        ) {
            params.includeResponseTypeDefinition = {
                payload: true,
                responseForms: true,
                commands: true,
                forEach: true,
                while: true,
                scratchpad: true,
                decisions: true,
                finishIf: true,
            };
        }

        const responseType = params.includeResponseTypeDefinition as Record<string, unknown>;

        if (!decisionsEnabled || ResolveFinishIfMode(params.finishIfMode) === 'off') {
            params.includeFinishIfDocs = false;
        }

        if (!decisionsEnabled || params.includeDecisionsDocs !== true) {
            params.includeDecisionsDocs = false;
        }

        const alignmentMappings: Array<{ docsFlag: string; responseTypeKey: string }> = [
            { docsFlag: 'includePayloadInPrompt', responseTypeKey: 'payload' },
            { docsFlag: 'includeResponseFormDocs', responseTypeKey: 'responseForms' },
            { docsFlag: 'includeCommandDocs', responseTypeKey: 'commands' },
            { docsFlag: 'includeForEachDocs', responseTypeKey: 'forEach' },
            { docsFlag: 'includeWhileDocs', responseTypeKey: 'while' },
            { docsFlag: 'includeScratchpadDocs', responseTypeKey: 'scratchpad' },
            { docsFlag: 'includeArtifactToolsDocs', responseTypeKey: 'artifactToolCalls' },
            { docsFlag: 'includeConversationToolsDocs', responseTypeKey: 'conversationToolCalls' },
            { docsFlag: 'includePipelineDocs', responseTypeKey: 'pipeline' },
            { docsFlag: 'includeMemoryWritesDocs', responseTypeKey: 'memoryWrites' },
            { docsFlag: 'includeDecisionsDocs', responseTypeKey: 'decisions' },
            { docsFlag: 'includeFinishIfDocs', responseTypeKey: 'finishIf' },
        ];

        for (const { docsFlag, responseTypeKey } of alignmentMappings) {
            const wasExplicitlySet =
                explicitResponseType &&
                Object.prototype.hasOwnProperty.call(explicitResponseType, responseTypeKey);

            if (params[docsFlag] === false && !wasExplicitlySet) {
                responseType[responseTypeKey] = false;
            } else if (responseType[responseTypeKey] === undefined) {
                responseType[responseTypeKey] = true;
            }
        }

        if (!decisionsEnabled) {
            responseType.decisions = false;
            responseType.finishIf = false;
        }

        const gateMappings: Array<{ gateFlag: string; responseTypeKey: string }> = [
            { gateFlag: 'enableTaskGraphs', responseTypeKey: 'tasks' },
            { gateFlag: 'enableHandoff', responseTypeKey: 'handoff' },
        ];

        for (const { gateFlag, responseTypeKey } of gateMappings) {
            const wasExplicitlySet =
                explicitResponseType &&
                Object.prototype.hasOwnProperty.call(explicitResponseType, responseTypeKey);
            if (!wasExplicitlySet) {
                responseType[responseTypeKey] = params[gateFlag] === true;
            }
        }
    }
}
