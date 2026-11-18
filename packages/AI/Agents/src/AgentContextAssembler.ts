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
} from '@memberjunction/core-entities';
import { MJActionEntityExtended } from '@memberjunction/actions-base';
import { BaseLLM, ChatMessage, IsPrefixPromptCache } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { LogError } from '@memberjunction/core';
import { IsPlainObject, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
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
     * (`LLM.PrefixPromptCache`), read from the model catalog's `ModelConfiguration` cascade —
     * `AIModelType < AIModel < AIVendor.Configuration.ModelDefaults < AIModelVendor` — via
     * `AIEngine.GetEffectiveModelConfiguration`. The most specific layer is the INFERENCE-PROVIDER
     * model-vendor row for `vendor`, whose vendor row supplies the host-wide default that beats the
     * model's own bag; when the vendor is unknown, or has no inference row for this model, the model
     * and type layers still answer. False when no layer declares it, which callers
     * treat as a block cache (replace-in-place).
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
     * Resolves the three temporal placeholders (`_CURRENT_DATE`, `_CURRENT_DAY_OF_WEEK`, `_CURRENT_TIME`)
     * for the trailing runtime-state fragment. Resolves only the three temporal placeholders (by name,
     * through the same registry the template uses, so a registered override applies here too) rather
     * than every system placeholder — this runs on every loop iteration.
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
     * Reads scratchpad notes, tasks, and task summary from prepared prompt template data
     * (so the fragment shows exactly what the template would have). Null when the scratchpad
     * is disabled or absent.
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
            // Same value the agent type injects for the template (`payload || {}`), so both placements agree.
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
     * Formats the skill CATALOG as compact markdown — name + description ONLY. This is
     * progressive disclosure by design: the LLM sees just enough to decide whether to activate a
     * skill (via a `'Skill'` next step), but never sees `Instructions` until it does.
     */
    public FormatSkillsCatalog(skills: MJAISkillEntity[]): string {
        return skills.map((s) => `- **${s.Name}** — ${s.Description ?? '(no description)'}`).join('\n');
    }

    /**
     * Formats action details as compact markdown for inclusion in prompt context.
     * Produces ~75% fewer tokens than the previous JSON format while preserving
     * all information the LLM needs to invoke actions correctly.
     *
     * A parameter the run binds (`ExecuteAgentParams.boundActionParams`) is left out, so the model is
     * never told it exists. With no bindings the output is the cached catalog's, unchanged.
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
     * Uses `\*` suffix for required, `(array)` when `IsArray`, and only shows
     * `ValueType` when it is not `Scalar`/`Other`.
     */
    public FormatActionParameter(param: MJActionParamEntity): string {
        const requiredMarker = param.IsRequired ? '\\*' : '';
        const parts: string[] = [];

        if (param.IsArray) {
            parts.push('array');
        }

        // A stored ValueSchema is the real type, so it replaces the coarse ValueType label — the
        // same information the native tool declaration carries.
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
     * Resolves the client tools in force for a run: the agent's static metadata tools under the
     * session, app, and override tiers, merged by {@link ResolveClientTools} with its fixed precedence.
     * Both the prompt section and the client-tool execution step resolve through here so the tools
     * offered to the model and the metadata its results are classified against come from one list.
     */
    public ResolveClientToolsForRun(
        agent: MJAIAgentEntityExtended,
        extraData?: Record<string, unknown>
    ): ClientToolMetadata[] {
        const engine = AIEngine.Instance;
        // Static tier — agent's metadata tools from the AI Agent Client Tools junction.
        const staticTools: ClientToolMetadata[] = engine.GetClientToolsForAgent(agent.ID).map((tool) => ({
            Name: tool.Name,
            Description: tool.Description,
            InputSchema: tool.InputSchemaJSON ? JSON.parse(tool.InputSchemaJSON) : {},
            OutputSchema: tool.OutputSchemaJSON ? JSON.parse(tool.OutputSchemaJSON) : undefined,
            Category: tool.Category || undefined,
            DefaultTimeoutMs: tool.DefaultTimeoutMs || undefined,
        }));

        // Dynamic (session) tier — client-SDK enriched tools for this session.
        const sessionID = extraData?.sessionID as string | undefined;
        const sessionTools = sessionID ? ClientToolRequestManager.Instance.GetSessionTools(sessionID) : [];

        // App tier — tools the active surface published in the app-context capability manifest.
        const appContext = extraData?.appContext as
            | { Capabilities?: { Tools?: ClientToolMetadata[] } }
            | undefined;
        const appTools = appContext?.Capabilities?.Tools ?? [];

        // Override tier — tools passed directly in the run's data.
        const overrideTools = (extraData?.clientTools as ClientToolMetadata[] | undefined) ?? [];

        return ResolveClientTools({
            agentId: agent.ID,
            staticTools,
            sessionTools,
            appTools,
            overrideTools,
        });
    }

    /**
     * Builds the client tool prompt section for system prompt injection across static,
     * session, app, and override tiers (`override > session > app > static`).
     */
    public BuildClientToolPromptSection(
        agent: MJAIAgentEntityExtended,
        extraData?: Record<string, unknown>
    ): string {
        const tools = this.ResolveClientToolsForRun(agent, extraData);

        if (tools.length === 0) {
            return ''; // No client tools available
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

            // Show input parameters from InputSchema
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

        // Additional context reported by the active view/component
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
        // Align a copy: the object may be the caller's per-run override, which sub-agents inherit with the
        // run's data. Writing into it would turn a key "explicit" for every later merge of that override.
        if (IsPlainObject(params.includeResponseTypeDefinition)) {
            params.includeResponseTypeDefinition = { ...params.includeResponseTypeDefinition };
        }
        // Ensure includeResponseTypeDefinition is an object
        else if (
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

        // finishIf gates are opt-in (`finishIfMode`), and need the master switch. While off, the model is
        // not taught to write one, whatever includeFinishIfDocs says, so the response field below follows it off too.
        if (!decisionsEnabled || ResolveFinishIfMode(params.finishIfMode) === 'off') {
            params.includeFinishIfDocs = false;
        }

        // `decisions` is opt-in too (`includeDecisionsDocs: true`), and needs the master switch. Its docs and
        // types add about 1,200 tokens to every turn, and on the Prompt Eval corpus no model used it
        // (typed-decision plan, Task 4.7). Unset means off, so the response field below follows it off too.
        if (!decisionsEnabled || params.includeDecisionsDocs !== true) {
            params.includeDecisionsDocs = false;
        }

        // Auto-alignment mappings: docs flag → response type property
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
            // Check if the user explicitly set this response type property
            // (not from schema defaults, which always provide true)
            const wasExplicitlySet =
                explicitResponseType &&
                Object.prototype.hasOwnProperty.call(explicitResponseType, responseTypeKey);

            // Auto-align: if docs flag is false AND user didn't explicitly set the response type
            // then auto-align the response type to false
            if (params[docsFlag] === false && !wasExplicitlySet) {
                responseType[responseTypeKey] = false;
            }
            // If user explicitly set the value, respect it regardless of docs flag
            // Otherwise default to true if not set
            else if (responseType[responseTypeKey] === undefined) {
                responseType[responseTypeKey] = true;
            }
        }

        // With the master switch off, neither decision field is offered, even when set explicitly: the
        // model must not be invited to ask for something the run would refuse.
        if (!decisionsEnabled) {
            responseType.decisions = false;
            responseType.finishIf = false;
        }

        // Capability gates align the OTHER way: default OFF, and the section appears only when the
        // gate is explicitly on. Running these through the loop above would invert their meaning —
        // that loop's `else` branch defaults an unset key to true, which is exactly what a gated
        // capability must never do.
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
