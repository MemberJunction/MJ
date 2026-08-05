import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseAgent } from '@memberjunction/ai-agents';
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
import { HarnessTurnResult, HarnessWorkspaceScope, HarnessNetworkPolicy } from './types.js';

/** Shape of the harness block inside `AIAgent.TypeConfiguration`. */
interface HarnessAgentConfig {
    harnessName?: string;
    sandbox?: {
        provider?: 'local' | 'docker';
        image?: string;
        workspaceScope?: HarnessWorkspaceScope;
        networkPolicy?: HarnessNetworkPolicy;
    };
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

            const input = this.buildTurnInput(promptParams);
            const turn = await this.runTurn(input);
            const promptRun = await this.recordPromptRun(promptParams, turn, startTime);

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

        await this.adapter.StartSession({
            Executor: this.sandboxHandle.Executor,
            WorkspacePath: this.sandboxHandle.WorkspacePath,
            Environment: environment,
            Model: harness.DefaultModel ?? undefined,
            CancellationToken: promptParams.cancellationToken,
        });

        LogStatus(`Harness session started for '${harness.Name}' (${harness.DriverClass})`);
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
            run.ModelID = ids.ModelID;
            run.VendorID = ids.VendorID;
            run.AgentID = this._agentRunAgentId();
            run.RunAt = startTime;
            run.CompletedAt = new Date();
            run.Success = !turn.ErrorMessage;
            run.Status = turn.ErrorMessage ? 'Failed' : 'Completed';
            run.TokensPrompt = turn.InputTokens;
            run.TokensCompletion = turn.OutputTokens;
            run.TokensUsed = turn.InputTokens + turn.OutputTokens;
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
     * Builds the environment injected into the sandbox from the agent's credential grants.
     *
     * This is the only channel by which a secret reaches the harness, and it carries exactly what
     * `MJ: AI Agent Credentials` grants — never the MJAPI process environment, never DB credentials,
     * never a user token.
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
                return environment;
            }

            for (const grant of grants.Results ?? []) {
                if (!grant.EnvVariableName) {
                    // No variable name means the adapter decides — nothing to inject generically.
                    continue;
                }
                const secret = await this.loadCredentialValue(grant.CredentialID, contextUser);
                if (secret) {
                    environment[grant.EnvVariableName] = secret;
                }
            }
        } catch (e) {
            LogError(`Failed to resolve harness environment: ${describeError(e)}`);
        }
        return environment;
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

    /** The text handed to the harness for this turn. */
    private buildTurnInput(promptParams: AIPromptParams): string {
        const messages = promptParams.conversationMessages ?? [];
        const last = messages[messages.length - 1];
        const content = last?.content;
        return typeof content === 'string' ? content : JSON.stringify(content ?? '');
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
        return (this as unknown as { _agentRun?: { AgentID?: string } })._agentRun?.AgentID ?? '';
    }

    private _agentTypeConfiguration(): string | null {
        return (this as unknown as { _agentConfig?: { agent?: { TypeConfiguration?: string | null } } })._agentConfig
            ?.agent?.TypeConfiguration ?? null;
    }
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
