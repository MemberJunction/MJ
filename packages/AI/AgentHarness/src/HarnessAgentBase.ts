import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseAgent } from '@memberjunction/ai-agents';
import { TemplateEngineServer } from '@memberjunction/templates';
import { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { ChatResult, ModelUsage } from '@memberjunction/ai';
import {
    MJAIAgentHarnessEntity,
    MJAIAgentCredentialEntity,
    MJAIPromptRunEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';
import { BaseHarnessAdapter } from './adapters/BaseHarnessAdapter.js';
import { ISandboxProvider, SandboxHandle, WorkspaceKey } from './sandbox/ISandboxProvider.js';
import { LocalDirectorySandboxProvider } from './sandbox/LocalDirectorySandboxProvider.js';
import { DockerSandboxProvider } from './sandbox/DockerSandboxProvider.js';
import {
    HarnessTurnResult,
    HarnessWorkspaceScope,
    HarnessNetworkPolicy,
    HarnessPosture,
    HarnessPermissionPolicy,
} from './types.js';

/**
 * Conventional environment variable each harness reads its own credential from.
 *
 * Only used by the zero-config vendor-key fallback. Explicit rather than derived because writing a
 * key into the wrong variable name fails silently from MJ's side — the harness simply reports an
 * auth error much later, with nothing pointing back at the mapping.
 */
const HARNESS_CREDENTIAL_ENV_VARS: Record<string, string> = {
    ClaudeCodeCliAdapter: 'ANTHROPIC_API_KEY',
    CodexAdapter: 'OPENAI_API_KEY',
    GeminiCliAdapter: 'GEMINI_API_KEY',
};

/**
 * Restated at the end of every turn input.
 *
 * Not redundant with the system prompt: a harness runs a full agentic loop inside its turn, so by
 * the time it finishes working, the instruction it saw at the start is many internal steps behind
 * it. Restating costs a few tokens; the alternative is a malformed-response retry, which costs a
 * whole turn.
 */
const TURN_END_CONTRACT = [
    '---',
    'END OF TURN REQUIREMENT (this overrides any inclination to reply conversationally):',
    'Respond with ONLY a single raw JSON object matching the response format you were given.',
    'No prose, no markdown fences, no narration before or after. If the work is complete, say so',
    'INSIDE the JSON. If you cannot proceed, say that inside the JSON too.',
].join('\n');

/** Shape of the harness block inside `AIAgent.TypeConfiguration`. */
interface HarnessAgentConfig {
    harnessName?: string;
    sandbox?: {
        provider?: 'local' | 'docker';
        image?: string;
        workspaceScope?: HarnessWorkspaceScope;
        networkPolicy?: HarnessNetworkPolicy;
    };
    posture?: HarnessPosture;
    permissions?: { allowedTools?: string[]; disallowedTools?: string[] };
    limits?: { maxWallClockSeconds?: number };
}

/**
 * Executes an MJ agent whose reasoning substrate is an external harness.
 *
 * ## The single seam
 *
 * `BaseAgent` already runs an iterate → decide → execute-steps → iterate loop where the "decide"
 * input is a prompt execution. This class overrides exactly one method — {@link executePrompt} — and
 * substitutes a harness turn for that prompt call. Everything else is untouched `BaseAgent`: the
 * loop, next-step validation, action and sub-agent execution, payload merging under ACLs, guardrail
 * checks between iterations, and run-step recording.
 *
 * That is worth stating precisely because it is the whole architectural bet. `executePrompt` is a
 * five-line protected method with a single call site, so substituting it changes what produces a
 * decision without changing anything about how decisions are validated or enforced.
 *
 * ## Accounting is not optional
 *
 * A harness turn must produce a real `AIPromptRun` row. Run totals are DERIVED — `calculateTokenStats`
 * sums `AIAgentRunStep.PromptRun` rollups — so a turn that records no prompt run contributes nothing,
 * and the run reports zero tokens and zero cost forever. Combined with the cost guardrail, that means
 * a runaway harness would never be interrupted: the ceiling would have nothing to compare against.
 *
 * `AIPromptRun.PromptID`, `.ModelID` and `.VendorID` are all NOT NULL, and every one is resolved to a
 * REAL catalog row rather than a placeholder — see {@link resolveAccountingIds}.
 */
@RegisterClass(BaseAgent, 'HarnessAgentType')
export class HarnessAgentBase extends BaseAgent {
    private adapter: BaseHarnessAdapter | null = null;
    private sandboxProvider: ISandboxProvider | null = null;
    private sandboxHandle: SandboxHandle | null = null;
    private harnessRow: MJAIAgentHarnessEntity | null = null;
    private turnIndex = 0;

    /**
     * Substitutes a harness turn for the prompt call a Loop agent would make.
     *
     * The returned {@link AIPromptRunResult} is shaped exactly as `AIPromptRunner` would shape one,
     * because everything downstream — `DetermineNextStep`, the malformed-response retry machinery,
     * step recording — reads it without knowing or caring that a harness produced it.
     */
    protected override async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const startTime = new Date();
        try {
            if (this.turnIndex === 0) {
                await this.startHarnessSession(promptParams);
            }
            this.turnIndex++;

            const isFirstTurn = this.turnIndex === 1;
            const input = await this.buildTurnInput(promptParams, isFirstTurn);
            const turn = await this.runTurn(input);
            const promptRun = await this.recordPromptRun(promptParams, turn, startTime, input);
            this.persistExternalSessionId(turn.SessionId);

            return this.buildPromptResult(turn, promptRun, startTime);
        } catch (e) {
            const message = describeError(e);
            LogError(`Harness turn failed: ${message}`);
            return this.buildPromptResult(
                { RawText: '', InputTokens: 0, OutputTokens: 0, ErrorMessage: message },
                undefined,
                startTime,
            );
        }
    }

    /** Provisions the sandbox, resolves credentials and launches the harness session. */
    private async startHarnessSession(promptParams: AIPromptParams): Promise<void> {
        const contextUser = promptParams.contextUser;
        const config = this.readHarnessConfig();
        const harness = await this.loadHarnessRow(config.harnessName, contextUser);
        this.harnessRow = harness;

        this.adapter = this.resolveAdapter(harness);
        this.sandboxProvider = this.createSandboxProvider(config);

        const key: WorkspaceKey = {
            Scope: config.sandbox?.workspaceScope ?? 'agent-user',
            AgentId: this._agentRunAgentId(),
            UserId: contextUser?.ID,
            RunId: this._agentRunId(),
        };
        this.sandboxHandle = await this.sandboxProvider.Provision(key, {
            NetworkPolicy: config.sandbox?.networkPolicy ?? 'mcp-only',
            Image: config.sandbox?.image,
        });

        const environment = await this.resolveGrantedEnvironment(contextUser);

        // Permissions are declared in agent metadata and applied BEFORE the session starts, so
        // adapters can fold them into launch flags. Runtime overrides arrive through the same
        // TypeConfiguration merge as every other harness setting, so a caller can loosen or tighten
        // a single run without editing the agent.
        const policy = this.resolvePermissionPolicy(config);
        this.adapter.ApplyPermissionPolicy(policy);
        if (policy.Posture === 'strict' && !this.adapter.Capabilities?.PermissionHooks) {
            LogStatus(
                `Harness '${harness.Name}' is set to STRICT posture but its adapter reports no ` +
                    `permission hooks. The harness's own prompts have nowhere to go headlessly, so ` +
                    `mutating tool calls will simply be denied rather than routed for approval.`,
            );
        }

        const resumeSessionId = await this.findResumableSession(harness, key.Scope, contextUser);

        await this.adapter.StartSession({
            ResumeSessionId: resumeSessionId,
            PermissionPolicy: policy,
            Executor: this.sandboxHandle.Executor,
            WorkspacePath: this.sandboxHandle.WorkspacePath,
            Environment: environment,
            Model: harness.DefaultModel ?? undefined,
            CancellationToken: promptParams.cancellationToken,
        });

        LogStatus(`Harness session started for '${harness.Name}' (${harness.DriverClass})`);
    }

    /**
     * Resolves what the agent may do inside its sandbox.
     *
     * Defaults to `strict` when unset — the safe direction. An agent that has never been given a
     * posture should be unable to mutate anything, rather than inheriting whatever the harness does
     * by default, which for a coding agent is a great deal.
     */
    private resolvePermissionPolicy(config: HarnessAgentConfig): HarnessPermissionPolicy {
        return {
            Posture: config.posture ?? 'strict',
            AllowedTools: config.permissions?.allowedTools,
            DisallowedTools: config.permissions?.disallowedTools,
        };
    }

    /**
     * Finds a prior harness session this run can continue, if the adapter can use one.
     *
     * ## Why this is worth doing
     *
     * Without it, every message in a conversation opens a COLD session and MJ replays the whole
     * history into it. Measured on two consecutive messages in one conversation: the second cost
     * $0.0448 against the first's $0.0155 — nearly 3x, spent entirely on re-reading context the
     * harness had already been told once.
     *
     * ## Three gates, each guarding a different way this goes wrong
     *
     * 1. `SessionResume` capability — a harness that cannot resume must keep replaying. Offering a
     *    session id to an adapter that ignores it is harmless; ASSUMING it resumed is not, which is
     *    why the outcome is reported back rather than inferred.
     * 2. Workspace scope must be durable. Harnesses key their session store by working directory, so
     *    a `run`-scoped workspace is a new directory every time and the session would never be
     *    found. Gating here keeps the failure at "no resume" rather than a silent miss.
     * 3. Same conversation. That is the continuity boundary users already understand — a time-based
     *    cache would expire while someone is at lunch and, worse, leak stale context into an
     *    unrelated new conversation.
     */
    private async findResumableSession(
        harness: MJAIAgentHarnessEntity,
        scope: HarnessWorkspaceScope,
        contextUser?: UserInfo,
    ): Promise<string | undefined> {
        if (!this.adapter?.Capabilities?.SessionResume) {
            return undefined;
        }
        if (scope === 'run') {
            return undefined;
        }
        const conversationId = this._agentRunConversationId();
        if (!conversationId) {
            return undefined;
        }
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ExternalSessionID: string }>(
                {
                    EntityName: 'MJ: AI Agent Runs',
                    Fields: ['ExternalSessionID'],
                    ExtraFilter:
                        `AgentID='${this._agentRunAgentId()}' AND ConversationID='${conversationId}' ` +
                        `AND ExternalSessionID IS NOT NULL`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                contextUser,
            );
            if (!result.Success) {
                LogError(`Failed to look up a resumable harness session: ${result.ErrorMessage}`);
                return undefined;
            }
            const sessionId = result.Results?.[0]?.ExternalSessionID;
            if (sessionId) {
                LogStatus(`Resuming harness session ${sessionId} for '${harness.Name}'.`);
            }
            return sessionId;
        } catch (e) {
            LogError(`Failed to look up a resumable harness session: ${describeError(e)}`);
            return undefined;
        }
    }

    /** Accumulates one turn's event stream into a single result. */
    private async runTurn(input: string): Promise<HarnessTurnResult> {
        const adapter = this.adapter!;
        const turn: HarnessTurnResult = { RawText: '', InputTokens: 0, OutputTokens: 0 };

        for await (const event of adapter.RunTurn(input)) {
            switch (event.Type) {
                case 'usage':
                    // Summed rather than replaced: a harness may report usage more than once per
                    // turn, and undercounting here silently weakens the cost guardrail.
                    turn.InputTokens += event.InputTokens;
                    turn.OutputTokens += event.OutputTokens;
                    turn.CostUsd = (turn.CostUsd ?? 0) + (event.CostUsd ?? 0);
                    break;
                case 'turn-complete':
                    turn.RawText = event.RawText;
                    break;
                case 'session-error':
                    turn.ErrorMessage = event.Error;
                    break;
                default:
                    // assistant-text and sandbox-activity are live-view only. They are deliberately
                    // NOT persisted as run steps — the audit boundary is the turn, and widening it
                    // to in-sandbox activity is a documented non-goal, not an oversight.
                    break;
            }
        }

        turn.SessionId = adapter.SessionId;
        turn.ReportedModel = adapter.ReportedModel;
        return turn;
    }

    /**
     * Writes the `AIPromptRun` that carries this turn's usage.
     *
     * Returns undefined only when the row could not be created, which is logged loudly rather than
     * swallowed: without it the run's cost and token totals stay at zero and its guardrails go blind.
     */
    private async recordPromptRun(
        promptParams: AIPromptParams,
        turn: HarnessTurnResult,
        startTime: Date,
        input: string,
    ): Promise<MJAIPromptRunEntity | undefined> {
        try {
            const ids = await this.resolveAccountingIds(promptParams);
            if (!ids) {
                LogError(
                    'Harness turn could not resolve a Prompt/Model/Vendor for accounting; this run will ' +
                        'under-report tokens and cost, and its cost guardrail will not fire. Set ' +
                        'AIAgentHarness.AIModelID and AIVendorID.',
                );
                return undefined;
            }

            const md = promptParams.contextUser ? new Metadata() : new Metadata();
            const run = await md.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', promptParams.contextUser);
            run.NewRecord();
            run.PromptID = ids.PromptID;
            run.ModelID = (await this.resolveReportedModelId(turn.ReportedModel, promptParams)) ?? ids.ModelID;
            run.VendorID = ids.VendorID;
            run.AgentID = this._agentRunAgentId();
            run.RunAt = startTime;
            run.CompletedAt = new Date();
            run.Success = !turn.ErrorMessage;
            run.Status = turn.ErrorMessage ? 'Failed' : 'Completed';
            // Messages/Result are what the run-detail UI renders. AIPromptRunner populates them as
            // a matter of course; synthesizing this row by hand reproduced the ACCOUNTING fields and
            // dropped the OBSERVABILITY ones, so every harness prompt step showed blank input and
            // output while its token and cost numbers were correct.
            // JSON, not a raw string. AIPromptRun.Messages is documented as "the input messages sent
            // to the model, typically in JSON format" and the run-detail UI parses it as such — a raw
            // string parses to nothing, which is why the response rendered and the input did not.
            run.Messages = JSON.stringify([{ role: 'user', content: input }]);
            run.Result = turn.RawText;
            run.TokensPrompt = turn.InputTokens;
            run.TokensCompletion = turn.OutputTokens;
            run.TokensUsed = turn.InputTokens + turn.OutputTokens;
            // The ROLLUP columns are what BaseAgent.calculateTokenStats actually sums — the non-rollup
            // ones are ignored by it entirely. Setting only TokensUsed left every harness run
            // reporting zero tokens while its cost was correct, which is a confusing half-truth: it
            // looks like a free run rather than an unaccounted one. A harness turn has no nested
            // child prompt runs, so the rollup equals the turn's own usage.
            run.TokensPromptRollup = turn.InputTokens;
            run.TokensCompletionRollup = turn.OutputTokens;
            run.TokensUsedRollup = turn.InputTokens + turn.OutputTokens;
            if (turn.CostUsd !== undefined) {
                run.TotalCost = turn.CostUsd;
            }
            if (turn.ErrorMessage) {
                run.ErrorMessage = turn.ErrorMessage;
            }

            if (!(await run.Save())) {
                LogError(`Failed to save harness AIPromptRun: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                return undefined;
            }
            return run;
        } catch (e) {
            LogError(`Failed to record harness AIPromptRun: ${describeError(e)}`);
            return undefined;
        }
    }

    /**
     * Resolves the three NOT NULL foreign keys on `AIPromptRun` to REAL catalog rows.
     *
     * None of these is a placeholder, which is the point — inventing catalog rows to satisfy a
     * constraint would pollute the model and vendor catalogs with fictions that then show up in
     * every cost report:
     *
     *   · PromptID — the agent type's system prompt. The harness turn really was produced by that
     *     template; it is the same one the Loop type renders.
     *   · VendorID — `AIAgentHarness.AIVendorID`. Claude Code really does call Anthropic.
     *   · ModelID  — `AIAgentHarness.AIModelID`. Ideally this would be the model the harness
     *     REPORTED for the turn, resolved by name; that refinement belongs here once adapters
     *     surface it, and falls back to the declared model meanwhile.
     */
    private async resolveAccountingIds(
        promptParams: AIPromptParams,
    ): Promise<{ PromptID: string; ModelID: string; VendorID: string } | null> {
        const promptId = promptParams.prompt?.ID;
        const modelId = this.harnessRow?.AIModelID;
        const vendorId = this.harnessRow?.AIVendorID;
        if (!promptId || !modelId || !vendorId) {
            return null;
        }
        return { PromptID: promptId, ModelID: modelId, VendorID: vendorId };
    }

    /**
     * Resolves the model the harness REPORTED using to an MJ catalog row.
     *
     * Recording the model we assumed rather than the one that ran is not a cosmetic problem: a
     * harness picks its own model unless told otherwise, and Opus and Sonnet are not the same price,
     * so the run's cost is attributed to the wrong model. Observed live — the harness ran
     * `claude-opus-4-6` while the run recorded Claude Sonnet 5, purely because that was the harness
     * row's declared anchor.
     *
     * Returns null when the reported name matches nothing, letting the caller fall back to the
     * declared anchor. A miss is expected for a model newer than the catalog and must not fail the
     * run — an approximate attribution still beats no AIPromptRun at all.
     */
    private async resolveReportedModelId(
        reportedModel: string | undefined,
        promptParams: AIPromptParams,
    ): Promise<string | null> {
        if (!reportedModel) {
            return null;
        }
        try {
            // APIName lives on AIModelVendor, NOT AIModel — the first version of this queried
            // AIModel.APIName, which does not exist. RunView returns Success:false for an invalid
            // column rather than throwing, so the resolver failed SILENTLY on every turn and quietly
            // fell back to the declared anchor. That is the failure shape this codebase keeps
            // producing: a wrong answer that looks like a right one.
            //
            // Vendors report dated variants (`claude-sonnet-4-5-20250929`) where the catalog holds
            // the base name (`claude-sonnet-4-5`), so an exact match is tried first and a prefix
            // match second.
            const escaped = reportedModel.replace(/'/g, "''");
            const base = escaped.replace(/-\d{8}$/, '');
            const rv = new RunView();
            const result = await rv.RunView<{ ModelID: string }>(
                {
                    EntityName: 'MJ: AI Model Vendors',
                    Fields: ['ModelID'],
                    ExtraFilter: `APIName='${escaped}' OR APIName='${base}'`,
                    ResultType: 'simple',
                },
                promptParams.contextUser,
            );
            if (!result.Success) {
                LogError(`Reported-model lookup failed for '${reportedModel}': ${result.ErrorMessage}`);
                return null;
            }
            const modelId = result.Results?.[0]?.ModelID ?? null;
            if (!modelId) {
                LogStatus(
                    `Harness reported model '${reportedModel}', which is not in the catalog — ` +
                        `attributing this turn to the harness row's declared model instead.`,
                );
            }
            return modelId;
        } catch (e) {
            LogError(`Failed to resolve reported harness model '${reportedModel}': ${describeError(e)}`);
            return null;
        }
    }

    /**
     * Records the harness session on the run.
     *
     * AIAgentRun.ExternalSessionID exists precisely so an MJ run can be correlated with the vendor's
     * own session logs when diagnosing in-sandbox behaviour — the one place MJ's audit trail
     * deliberately stops. It was added, documented, and then never populated, so answering "did this
     * run resume its session?" meant reading the vendor's files off disk instead of the run record.
     */
    private persistExternalSessionId(sessionId: string | undefined): void {
        const run = (this as unknown as { _agentRun?: { ExternalSessionID?: string | null } })._agentRun;
        if (run && sessionId && !run.ExternalSessionID) {
            run.ExternalSessionID = sessionId;
        }
    }

    /**
     * Builds the environment injected into the sandbox.
     *
     * ## Secrets travel as process environment, never as prompt text
     *
     * Everything resolved here is handed to the sandbox executor and becomes the harness PROCESS's
     * environment. None of it is rendered into the turn prompt, so a credential never enters the
     * model's context and cannot be echoed back, logged as conversation, or persisted to a run step.
     * It lives exactly as long as the process does.
     *
     * ## Resolution order — credentials first, env as the documented fallback
     *
     * Mirrors how MJ's AI layer already resolves vendor keys, because operators should not have to
     * learn a second scheme:
     *
     *   1. `MJ: AI Agent Credentials` grants for this agent, read from `MJ: Credentials`. The
     *      governed path — auditable, revocable, per-agent.
     *   2. The server's own `process.env[EnvVariableName]`. If a harness needs ANTHROPIC_API_KEY and
     *      no credential row grants one, the MJAPI process's own value is used.
     *   3. When the agent has no grants at all, the harness vendor's key under the existing
     *      `AI_VENDOR_API_KEY__<DRIVER>` convention — the zero-config path.
     *
     * Preferring credentials matters: env vars are process-wide, so falling back means an agent gets
     * whatever the server holds rather than only what it was granted. That is the pragmatic path for
     * dev and single-tenant installs, and the reason multi-tenant deployments should grant
     * explicitly. The distinction is logged, not silent.
     */
    private async resolveGrantedEnvironment(contextUser?: UserInfo): Promise<Record<string, string>> {
        const environment: Record<string, string> = {};
        try {
            const rv = new RunView();
            const grants = await rv.RunView<MJAIAgentCredentialEntity>(
                {
                    EntityName: 'MJ: AI Agent Credentials',
                    ExtraFilter: `AgentID='${this._agentRunAgentId()}' AND Status='Active'`,
                    OrderBy: 'Priority ASC',
                    ResultType: 'entity_object',
                },
                contextUser,
            );
            if (!grants.Success) {
                LogError(`Failed to load harness credential grants: ${grants.ErrorMessage}`);
            }

            const rows = grants.Success ? (grants.Results ?? []) : [];
            for (const grant of rows) {
                if (!grant.EnvVariableName) {
                    // No variable name means the adapter decides how to surface it; nothing to
                    // inject generically.
                    continue;
                }
                const secret = await this.loadCredentialValue(grant.CredentialID, contextUser);
                if (secret) {
                    environment[grant.EnvVariableName] = secret;
                    continue;
                }
                const fromEnv = process.env[grant.EnvVariableName];
                if (fromEnv) {
                    LogStatus(
                        `Harness credential '${grant.EnvVariableName}' not resolvable from MJ: Credentials; ` +
                            'falling back to the server environment.',
                    );
                    environment[grant.EnvVariableName] = fromEnv;
                }
            }

            if (Object.keys(environment).length === 0) {
                this.applyVendorKeyFallback(environment);
            }
        } catch (e) {
            LogError(`Failed to resolve harness environment: ${describeError(e)}`);
        }
        return environment;
    }

    /**
     * Zero-config path: use the harness vendor's key from the environment when the agent has no
     * explicit grants.
     *
     * Uses the same `AI_VENDOR_API_KEY__<DRIVER>` convention the AI layer already uses, so a
     * developer who has MJ talking to Anthropic already has Claude Code working without seeding a
     * credential row.
     */
    private applyVendorKeyFallback(environment: Record<string, string>): void {
        const harness = this.harnessRow;
        if (!harness?.DriverClass) {
            return;
        }
        const envKey = `AI_VENDOR_API_KEY__${harness.DriverClass.toUpperCase()}`;
        const value = process.env[envKey];
        if (!value) {
            return;
        }
        // The variable the harness itself expects. Kept as an explicit map rather than guessed,
        // because writing a key into the wrong variable name is a silent no-op the harness reports
        // only as an auth failure. A harness not listed here must be granted explicitly through
        // MJ: AI Agent Credentials.
        const target = HARNESS_CREDENTIAL_ENV_VARS[harness.DriverClass];
        if (!target) {
            LogStatus(
                `Harness '${harness.Name}' has no credential grants and no known env-var convention for ` +
                    `driver '${harness.DriverClass}'. Grant one via MJ: AI Agent Credentials.`,
            );
            return;
        }
        environment[target] = value;
        LogStatus(`Harness '${harness.Name}' using vendor key fallback from ${envKey}.`);
    }

    /**
     * Reads a credential's value.
     *
     * Custody stays in `MJ: Credentials` — this only reads what the agent was granted, and does not
     * cache it beyond the session.
     */
    private async loadCredentialValue(credentialId: string, contextUser?: UserInfo): Promise<string | null> {
        try {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            if (!(await credential.Load(credentialId))) {
                return null;
            }
            return credential.Values ?? null;
        } catch (e) {
            LogError(`Failed to load credential ${credentialId}: ${describeError(e)}`);
            return null;
        }
    }

    /** Loads the harness registry row this agent selected by name. */
    private async loadHarnessRow(harnessName: string | undefined, contextUser?: UserInfo): Promise<MJAIAgentHarnessEntity> {
        if (!harnessName) {
            throw new Error(
                "Agent is of type 'Harness' but its TypeConfiguration does not name a harness. " +
                    'Set { "harnessName": "..." } matching a row in MJ: AI Agent Harnesses.',
            );
        }

        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentHarnessEntity>(
            {
                EntityName: 'MJ: AI Agent Harnesses',
                ExtraFilter: `Name='${harnessName.replace(/'/g, "''")}' AND Status='Active'`,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!result.Success) {
            throw new Error(`Failed to load harness '${harnessName}': ${result.ErrorMessage}`);
        }
        const row = result.Results?.[0];
        if (!row) {
            throw new Error(`No Active harness named '${harnessName}' in MJ: AI Agent Harnesses.`);
        }
        return row;
    }

    /** Resolves the adapter class named by the harness row. */
    private resolveAdapter(harness: MJAIAgentHarnessEntity): BaseHarnessAdapter {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseHarnessAdapter>(
            BaseHarnessAdapter,
            harness.DriverClass,
        );
        if (!instance) {
            throw new Error(
                `Harness '${harness.Name}' names DriverClass '${harness.DriverClass}', which is not registered. ` +
                    'Ensure the adapter package is loaded (see LoadAgentHarnessAdapters).',
            );
        }
        if (harness.ExecutablePath && 'SetExecutable' in instance) {
            (instance as unknown as { SetExecutable(p: string): void }).SetExecutable(harness.ExecutablePath);
        }
        return instance;
    }

    /** Chooses a sandbox provider from the agent's configuration. */
    private createSandboxProvider(config: HarnessAgentConfig): ISandboxProvider {
        return config.sandbox?.provider === 'docker'
            ? new DockerSandboxProvider({ defaultImage: config.sandbox?.image })
            : new LocalDirectorySandboxProvider();
    }

    /** Reads and parses the harness block from the agent's TypeConfiguration. */
    private readHarnessConfig(): HarnessAgentConfig {
        const raw = this._agentTypeConfiguration();
        if (!raw) {
            return {};
        }
        try {
            return JSON.parse(raw) as HarnessAgentConfig;
        } catch (e) {
            LogError(`AIAgent.TypeConfiguration is not valid JSON: ${describeError(e)}`);
            return {};
        }
    }

    /**
     * The text handed to the harness for this turn.
     *
     * ## Turn 1 carries the RENDERED system prompt — this is not optional
     *
     * The agent-type system prompt template holds the turn-end contract AND, critically, the
     * `_OUTPUT_EXAMPLE` placeholder that shows the harness the exact JSON envelope shape. In the
     * normal Loop path `AIPromptRunner` renders that template; a harness turn bypasses
     * AIPromptRunner, so without rendering it here the harness never sees the schema at all.
     *
     * The failure that caused is worth recording, because it did not look like a missing prompt.
     * The harness emitted well-formed JSON and simply GUESSED the vocabulary — `nextStep.type` came
     * back as `complete`, then `respond`, then `undefined`, none of which are Loop step names. Five
     * turns were burned while BaseAgent's retry feedback taught it the contract one rejection at a
     * time, turning a one-turn question into a two-minute run. A model inventing plausible values
     * for a schema it was never shown reads as a sloppy model; it is actually a missing prompt.
     *
     * Later turns send only the conversation: the harness has the contract from turn 1 and, where
     * `SessionResume` is true, still has it in session context.
     */
    private async buildTurnInput(promptParams: AIPromptParams, isFirstTurn: boolean): Promise<string> {
        // When the adapter genuinely resumed, the harness already holds the conversation — send only
        // the newest message, exactly as a user typing the next line would. Replaying history on top
        // of a resumed session hands it everything twice. Keyed off DidResumeSession (what happened)
        // rather than the capability flag (what is possible): a pruned session makes those disagree.
        const resumed = isFirstTurn && this.adapter?.DidResumeSession === true;
        const allMessages = promptParams.conversationMessages ?? [];
        const conversation = (resumed ? allMessages.slice(-1) : allMessages)
            .map((m) => {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
                return `[${m.role}]\n${content}`;
            })
            .join('\n\n');

        const contract = this.buildTurnEndContract(promptParams);
        if (isFirstTurn) {
            // Route MJ's system prompt to the harness's SYSTEM channel where the adapter supports it.
            // Sent as user text it competes with the harness's own system prompt and loses. The
            // contract stays in the turn input as well, so adapters without a system channel are
            // unaffected.
            const systemPrompt = await this.renderSystemPrompt(promptParams);
            if (systemPrompt.trim()) {
                this.adapter?.SetSystemPrompt(`${systemPrompt}\n\n${contract}`);
            }
        }
        return [conversation, contract].filter((p) => p.trim().length > 0).join('\n\n');
    }

    /**
     * The turn-end contract, carrying the ACTUAL envelope schema.
     *
     * Deliberately does not depend on template rendering succeeding. The schema reaches the harness
     * from `AIPrompt.OutputExample` directly, because the first attempt at this relied on the
     * agent-type template rendering `_OUTPUT_EXAMPLE` — and when that silently fell back to raw
     * template text, the harness received the literal string `{{ _OUTPUT_EXAMPLE }}` and was no
     * better off than before. It then invented step names (`complete`, `result`, `undefined`) across
     * five wasted turns.
     *
     * The step vocabulary is listed explicitly too. A harness that knows the SHAPE but guesses the
     * VALUES still fails validation, and that is precisely the failure mode observed: well-formed
     * JSON, invented `nextStep.type`.
     */
    private buildTurnEndContract(promptParams: AIPromptParams): string {
        const example = promptParams.prompt?.OutputExample?.trim();
        const lines = [
            '---',
            'END OF TURN REQUIREMENT (this overrides any inclination to reply conversationally):',
            'Respond with ONLY a single raw JSON object. No prose, no markdown fences, no narration',
            'before or after.',
            '',
            'To FINISH and return a final answer:',
            '  {"taskComplete": true, "message": "<your answer>", "reasoning": "<why you are done>"}',
            '',
            'To CONTINUE, set taskComplete false and supply nextStep. The field is nextStep.TYPE',
            '(not "step"), and it must be exactly one of:',
            '  Actions | Sub-Agent | Chat | Retry | ClientTools | ForEach | While | Pipeline | Skill | Plan',
            'There is no "Success" or "complete" type — completion is taskComplete: true, above.',
        ];
        if (example) {
            lines.push('', 'Full response shape:', example);
        }
        return lines.join('\n');
    }

    /**
     * Renders the agent type's system prompt through the same template engine AIPromptRunner uses,
     * so the harness receives exactly what a Loop model would — including the output example.
     *
     * Falls back to the raw template text if rendering fails. A partially-substituted prompt still
     * carries the envelope shape and lets the run proceed; throwing here would fail a run over a
     * template warning, which is the worse trade.
     */
    private async renderSystemPrompt(promptParams: AIPromptParams): Promise<string> {
        const prompt = promptParams.prompt;
        if (!prompt) {
            return '';
        }
        try {
            await TemplateEngineServer.Instance.Config(false, promptParams.contextUser);
            // Look the template up by ID, not name. TemplateEngineBase.FindTemplate takes a NAME —
            // passing prompt.TemplateID matched nothing on every call, so every render fell through
            // to the fallback and the harness never received the agent's own instructions. It failed
            // quietly because a fallback existed, which is exactly what made it survive two rounds of
            // fixing this same symptom.
            const template = TemplateEngineServer.Instance.Templates.find((t) => t.ID === prompt.TemplateID);
            const content = template?.GetHighestPriorityContent();
            if (template && content) {
                const rendered = await TemplateEngineServer.Instance.RenderTemplate(
                    template,
                    content,
                    { ...(promptParams.data ?? {}), ...(promptParams.templateData ?? {}) },
                    true,
                    true,
                );
                if (rendered.Success && rendered.Output?.trim()) {
                    return rendered.Output;
                }
                LogError(`Harness system prompt render returned no output: ${rendered.Message ?? 'unknown'}`);
            } else {
                LogError(
                    `Harness system prompt template not found for TemplateID '${prompt.TemplateID}' ` +
                        `(prompt '${prompt.Name}').`,
                );
            }
        } catch (e) {
            LogError(`Harness system prompt render failed, falling back to raw template: ${describeError(e)}`);
        }
        // Returning the RAW template would hand the harness literal `{{ placeholder }}` strings,
        // which is worse than sending nothing: it looks like a prompt, reads as noise, and the
        // turn-end contract below is then the only thing carrying real information. Return empty
        // and let the explicit contract do the work.
        LogError(
            'Harness system prompt could not be rendered; proceeding with the explicit turn-end ' +
                'contract only. The harness will not see agent-specific instructions this run.',
        );
        return '';
    }

    /** Shapes a harness turn as the prompt result the rest of BaseAgent expects. */
    private buildPromptResult(
        turn: HarnessTurnResult,
        promptRun: MJAIPromptRunEntity | undefined,
        startTime: Date,
    ): AIPromptRunResult {
        const endTime = new Date();
        const chatResult = new ChatResult(!turn.ErrorMessage, startTime, endTime);
        chatResult.data = {
            choices: [
                {
                    message: { role: 'assistant', content: turn.RawText },
                    finish_reason: turn.ErrorMessage ? 'error' : 'stop',
                    index: 0,
                },
            ],
            usage: new ModelUsage(turn.InputTokens, turn.OutputTokens),
        };
        chatResult.statusText = turn.ErrorMessage ?? 'OK';
        if (turn.ErrorMessage) {
            chatResult.errorMessage = turn.ErrorMessage;
        }

        return {
            success: !turn.ErrorMessage,
            // `result` is what LoopAgentType.parseJSONResponse reads — the harness's turn-end
            // envelope goes in exactly where a model's response would.
            result: turn.RawText,
            rawResult: turn.RawText,
            chatResult,
            errorMessage: turn.ErrorMessage,
            promptRun,
        };
    }

    /** Tears the session and sandbox down on every exit path. */
    public async EndHarnessSession(outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        try {
            await this.adapter?.EndSession();
        } catch (e) {
            LogError(`Harness adapter teardown failed: ${describeError(e)}`);
        }
        try {
            if (this.sandboxProvider && this.sandboxHandle) {
                await this.sandboxProvider.Finalize(this.sandboxHandle, outcome);
            }
        } catch (e) {
            LogError(`Harness sandbox finalize failed: ${describeError(e)}`);
        }
        this.adapter = null;
        this.sandboxHandle = null;
        this.sandboxProvider = null;
        this.turnIndex = 0;
    }

    // ---- narrow accessors over BaseAgent internals -------------------------------------------
    // Kept as small named methods so the coupling to BaseAgent's private state is visible in one
    // place rather than scattered through the class.

    private _agentRunId(): string {
        return (this as unknown as { _agentRun?: { ID?: string } })._agentRun?.ID ?? 'unknown-run';
    }

    private _agentRunAgentId(): string {
        return this._executeAgentParams()?.agent?.ID ?? '';
    }

    /**
     * The agent's type-specific configuration.
     *
     * Read from BaseAgent's `_executeParams`, NOT from `_agentConfig`: the latter is an
     * AgentConfiguration (agentType / systemPrompt / childPrompt) and carries no agent entity, so
     * reaching for `.agent` there silently yields undefined and every run fails with "does not name
     * a harness" no matter how it is configured.
     */
    private _agentRunConversationId(): string | null {
        return (this as unknown as { _agentRun?: { ConversationID?: string | null } })._agentRun?.ConversationID ?? null;
    }

    private _agentTypeConfiguration(): string | null {
        return this._executeAgentParams()?.agent?.TypeConfiguration ?? null;
    }

    private _executeAgentParams(): { agent?: { ID?: string; TypeConfiguration?: string | null } } | undefined {
        return (this as unknown as {
            _executeParams?: { agent?: { ID?: string; TypeConfiguration?: string | null } };
        })._executeParams;
    }
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
