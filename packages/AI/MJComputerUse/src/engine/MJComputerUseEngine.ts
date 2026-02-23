/**
 * MJ-aware Computer Use engine subclass.
 *
 * MJComputerUseEngine extends the base ComputerUseEngine to integrate
 * with MemberJunction's infrastructure:
 *
 * - **Prompt execution** routes through AIPromptRunner for template
 *   rendering, model selection, prompt run logging, and token tracking
 * - **Credential resolution** maps MJDomainAuthBinding with CredentialEntity
 *   to concrete AuthMethod instances (API Key, Basic, OAuth, Bearer)
 * - **Action-to-tool wrapping** exposes MJ Actions as ComputerUseTool
 *   instances so the controller LLM can invoke them
 * - **Media persistence** saves step screenshots as AIPromptRunMedia entities
 * - **Agent run linkage** links all prompt runs to a parent agent run
 */

import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatMessageRole, createBase64DataUrl } from '@memberjunction/ai';
import type { ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    ActionEntity,
    ActionParamEntity,
    AIPromptRunMediaEntity,
    CredentialEntity,
} from '@memberjunction/core-entities';

import {
    ComputerUseEngine,
    ComputerUseResult,
    ComputerUseError,
    ControllerPromptRequest,
    ControllerPromptResponse,
    JudgePromptRequest,
    JudgePromptResponse,
    ResponseParser,
    DomainAuthBinding,
    ComputerUseTool,
    JsonSchema,
    JsonSchemaProperty,
    StepRecord,
    ModelConfig,
} from '@memberjunction/computer-use';
import type { JsonSchemaType, AuthMethod } from '@memberjunction/computer-use';

import { MJRunComputerUseParams, MJDomainAuthBinding, ActionRef, PromptEntityRef } from '../types/mj-params.js';

export class MJComputerUseEngine extends ComputerUseEngine {
    private promptRunner: AIPromptRunner;
    private contextUser: UserInfo | undefined;
    private agentRunId: string | undefined;
    private lastPromptRunId: string | undefined;

    /** Resolved prompt entities — populated in Run() from PromptEntityRef refs */
    private controllerPromptEntity: AIPromptEntityExtended | undefined;
    private judgePromptEntity: AIPromptEntityExtended | undefined;

    constructor() {
        super();
        this.promptRunner = new AIPromptRunner();
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC API OVERRIDE
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute a Computer Use run with MJ infrastructure integration.
     *
     * Before calling the base Run():
     * 1. Stashes MJ-specific fields (contextUser, agentRunId)
     * 2. Resolves MJDomainAuthBindings with CredentialEntity → AuthMethod
     * 3. Wraps MJ Actions as ComputerUseTool instances
     *
     * Then delegates to super.Run() which handles the full execution loop.
     */
    public override async Run(params: MJRunComputerUseParams): Promise<ComputerUseResult> {
        this.contextUser = params.ContextUser;
        this.agentRunId = params.AgentRunId;
        this.lastPromptRunId = undefined;

        // Resolve prompt entity refs → full AIPromptEntityExtended
        this.controllerPromptEntity = await this.resolvePromptRef(params.ControllerPromptRef);
        this.judgePromptEntity = await this.resolvePromptRef(params.JudgePromptRef);

        // If no explicit controller prompt or model, auto-select the best
        // vision-capable LLM from MJ metadata. The base engine already has a
        // DEFAULT_CONTROLLER_PROMPT, so all we need is a model to send it to.
        if (!this.controllerPromptEntity && !params.ControllerModel) {
            const autoModel = await this.autoSelectControllerModel();
            if (!autoModel) {
                const result = new ComputerUseResult();
                result.Status = 'Error';
                result.Success = false;
                result.Error = new ComputerUseError(
                    'LLMError',
                    'No controller configured and no vision-capable AI model found in metadata. ' +
                    'Either set ControllerPromptRef, set ControllerModel, or ensure at least one ' +
                    'active LLM with Image input modality exists in the AI Models entity.'
                );
                LogError(result.Error.Message);
                return result;
            }
            params.ControllerModel = autoModel;
        }

        // Resolve MJ credential-backed auth bindings
        if (params.Auth?.Bindings) {
            params.Auth.Bindings = await this.resolveAuthBindings(params.Auth.Bindings);
        }

        // Wrap MJ Actions as tools for the controller LLM
        if (params.Actions && params.Actions.length > 0) {
            const actionTools = await this.wrapActionsAsTools(params.Actions);
            params.Tools = [...(params.Tools ?? []), ...actionTools];
        }

        return super.Run(params);
    }

    // ═══════════════════════════════════════════════════════════
    // PROTECTED OVERRIDES
    // ═══════════════════════════════════════════════════════════

    /**
     * Route controller prompt through MJ AIPromptRunner.
     *
     * If a ControllerPromptRef was resolved to an entity, uses AIPromptRunner
     * for full MJ integration (template rendering, model selection,
     * prompt run logging, token tracking). Otherwise falls back to
     * the base implementation (direct LLM call).
     */
    protected override async executeControllerPrompt(
        request: ControllerPromptRequest
    ): Promise<ControllerPromptResponse> {
        if (!this.controllerPromptEntity) {
            this.log('No ControllerPromptRef set — falling back to base LLM call');
            return super.executeControllerPrompt(request);
        }
        const promptEntity = this.controllerPromptEntity;

        try {
            this.log(`Executing controller prompt via AIPromptRunner (prompt: "${promptEntity.Name}")`);
            const result = await this.executePromptViaRunner(promptEntity, {
                goal: request.Goal,
                currentScreenshot: request.CurrentScreenshot,
                screenshotHistory: request.ScreenshotHistory,
                toolDefinitions: request.ToolDefinitions,
                judgeFeedback: request.JudgeFeedback,
                currentUrl: request.CurrentUrl,
                stepNumber: request.StepNumber,
                maxSteps: request.MaxSteps,
                formLoginCredentials: request.FormLoginCredentials,
                previousStepSummary: request.PreviousStepSummary,
            });

            if (!result.success) {
                this.logError(`AIPromptRunner failed: ${result.errorMessage ?? 'unknown error'}`);
                const response = new ControllerPromptResponse();
                response.Reasoning = `AIPromptRunner failed: ${result.errorMessage ?? 'unknown error'}`;
                response.RawResponse = response.Reasoning;
                return response;
            }

            // Track prompt run ID for media persistence
            if (result.promptRun?.ID) {
                this.lastPromptRunId = result.promptRun.ID;
            }

            const rawText = result.rawResult ?? '';
            this.log(`AIPromptRunner response: ${rawText.length} chars`);
            return ResponseParser.ParseControllerResponse(rawText);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logError(`MJ controller prompt threw exception: ${message}`);
            const response = new ControllerPromptResponse();
            response.Reasoning = `MJ controller prompt error: ${message}`;
            response.RawResponse = response.Reasoning;
            return response;
        }
    }

    /**
     * Route judge prompt through MJ AIPromptRunner.
     *
     * If a JudgePromptRef was resolved to an entity, uses AIPromptRunner.
     * Otherwise falls back to the base implementation.
     */
    protected override async executeJudgePrompt(
        request: JudgePromptRequest
    ): Promise<JudgePromptResponse> {
        if (!this.judgePromptEntity) {
            return super.executeJudgePrompt(request);
        }
        const promptEntity = this.judgePromptEntity;

        try {
            const result = await this.executePromptViaRunner(promptEntity, {
                goal: request.Goal,
                currentScreenshot: request.CurrentScreenshot,
                screenshotHistory: request.ScreenshotHistory,
                stepSummary: request.StepSummary,
                stepNumber: request.StepNumber,
                maxSteps: request.MaxSteps,
                currentUrl: request.CurrentUrl,
            });

            if (!result.success) {
                const response = new JudgePromptResponse();
                response.Reason = `AIPromptRunner failed: ${result.errorMessage ?? 'unknown error'}`;
                response.RawResponse = response.Reason;
                return response;
            }

            const response = new JudgePromptResponse();
            response.RawResponse = result.rawResult ?? '';
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const response = new JudgePromptResponse();
            response.Reason = `MJ judge prompt error: ${message}`;
            response.RawResponse = response.Reason;
            return response;
        }
    }

    /**
     * Persist step screenshot as AIPromptRunMedia entity.
     *
     * Links the screenshot to the most recent prompt run (from
     * the controller call in this step). Fire-and-forget — media
     * persistence errors are logged but don't fail the run.
     */
    protected override onStepComplete(step: StepRecord, params: MJRunComputerUseParams): void {
        if (step.Screenshot && this.lastPromptRunId && this.contextUser) {
            this.persistStepMedia(step, params.BrowserConfig?.ViewportHeight, params.BrowserConfig?.ViewportWidth).catch(err => {
                LogError(`Failed to persist step ${step.StepNumber} media: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }

    /**
     * Hook for run completion.
     * Currently logs completion status. Can be extended to update
     * agent run records or trigger post-run workflows.
     */
    protected override onRunComplete(result: ComputerUseResult): void {
        LogStatus(`Computer Use run complete: ${result.Status} (${result.TotalSteps} steps, ${result.TotalDurationMs}ms)`);
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT RESOLUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Resolve a PromptEntityRef to a full AIPromptEntityExtended.
     *
     * Uses AIEngine's in-memory Prompts cache for fast lookup.
     * Looks up by PromptId first (if set), then by PromptName.
     * Returns undefined if the ref is not provided.
     * Throws if the ref is provided but the prompt is not found.
     */
    private async resolvePromptRef(
        ref: PromptEntityRef | undefined
    ): Promise<AIPromptEntityExtended | undefined> {
        if (!ref) return undefined;
        if (!ref.PromptId && !ref.PromptName) return undefined;

        // Ensure AIEngine metadata is loaded before accessing Prompts
        await AIEngine.Instance.Config(false, this.contextUser);

        let prompt: AIPromptEntityExtended | undefined;
        if (ref.PromptId) {
            prompt = AIEngine.Instance.Prompts.find(p => p.ID === ref.PromptId);
        } else if (ref.PromptName) {
            prompt = AIEngine.Instance.Prompts.find(p => p.Name === ref.PromptName);
        }

        if (!prompt) {
            const identifier = ref.PromptId ?? ref.PromptName;
            throw new Error(
                `AI Prompt "${identifier}" not found. ` +
                `Verify the prompt exists in the AI Prompts entity.`
            );
        }

        return prompt;
    }

    /**
     * Auto-select the best controller model from MJ metadata.
     *
     * Uses the canonical MJ pattern: AIEngine.GetHighestPowerLLM()
     * which returns the highest-PowerRank active LLM across all vendors.
     *
     * Returns undefined if no active LLM exists at all.
     */
    private async autoSelectControllerModel(): Promise<ModelConfig | undefined> {
        const selected = await AIEngine.Instance.GetHighestPowerLLM(undefined, this.contextUser);
        if (!selected) return undefined;

        const vendor = selected.Vendor ?? 'unknown';
        const model = selected.APIName ?? selected.Name;
        const driverClass = selected.DriverClass ?? undefined;

        LogStatus(`Auto-selected controller model: ${vendor}:${model} (PowerRank=${selected.PowerRank ?? 0}, driver=${driverClass ?? 'auto'})`);

        return new ModelConfig(vendor, model, driverClass);
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute a prompt via AIPromptRunner with standard MJ integration.
     * Shared by both controller and judge prompt execution paths.
     *
     * Screenshots are extracted from the data object and sent as image
     * content blocks in conversationMessages (not as template variables),
     * since vision models require actual image attachments rather than
     * base64 strings embedded in text.
     */
    private async executePromptViaRunner(
        promptEntity: AIPromptEntityExtended,
        data: Record<string, unknown>
    ) {
        // Extract screenshot fields — these go as image messages, not template data
        const currentScreenshot = data.currentScreenshot as string | undefined;
        const screenshotHistory = data.screenshotHistory as string[] | undefined;

        // Build template-only data (exclude binary screenshot fields)
        const templateData = { ...data };
        delete templateData.currentScreenshot;
        delete templateData.screenshotHistory;

        // Build image conversation messages for the vision model
        const conversationMessages = this.buildScreenshotMessages(currentScreenshot, screenshotHistory);

        const params = new AIPromptParams();
        params.prompt = promptEntity;
        params.data = templateData;
        params.contextUser = this.contextUser;
        params.agentRunId = this.agentRunId;
        params.attemptJSONRepair = true;

        if (conversationMessages.length > 0) {
            params.conversationMessages = conversationMessages;
        }

        return this.promptRunner.ExecutePrompt(params);
    }

    /**
     * Build ChatMessage array with screenshot images for the vision model.
     *
     * Includes screenshot history (oldest → newest) followed by the
     * current screenshot, each as an image_url content block.
     */
    private buildScreenshotMessages(
        currentScreenshot: string | undefined,
        screenshotHistory: string[] | undefined
    ): ChatMessage[] {
        const messages: ChatMessage[] = [];

        // Include screenshot history if available
        const historyImages = screenshotHistory?.filter(s => s.length > 0) ?? [];
        if (historyImages.length > 0) {
            const historyContent: ChatMessageContentBlock[] = [
                {
                    type: 'text' as const,
                    content: `Here are the ${historyImages.length} most recent screenshots showing how the page has changed (oldest first):`,
                },
                ...historyImages.map((img) => ({
                    type: 'image_url' as const,
                    content: createBase64DataUrl(img, 'image/png'),
                    mimeType: 'image/png',
                } as ChatMessageContentBlock)),
            ];
            messages.push({
                role: ChatMessageRole.user,
                content: historyContent,
            });
        }

        // Include current screenshot
        if (currentScreenshot) {
            messages.push({
                role: ChatMessageRole.user,
                content: [
                    {
                        type: 'text' as const,
                        content: 'Here is the current screenshot of the browser. Analyze it and decide what to do next.',
                    },
                    {
                        type: 'image_url' as const,
                        content: createBase64DataUrl(currentScreenshot, 'image/png'),
                        mimeType: 'image/png',
                    },
                ],
            });
        }

        return messages;
    }

    // ═══════════════════════════════════════════════════════════
    // CREDENTIAL RESOLUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Resolve all MJDomainAuthBinding instances that have Credential set.
     * Maps CredentialEntity → concrete AuthMethod based on CredentialType.
     * Returns a clean DomainAuthBinding[] that the base engine can consume.
     */
    private async resolveAuthBindings(
        bindings: DomainAuthBinding[]
    ): Promise<DomainAuthBinding[]> {
        const resolved: DomainAuthBinding[] = [];

        for (const binding of bindings) {
            if (binding instanceof MJDomainAuthBinding && binding.Credential) {
                const resolvedBinding = await this.resolveCredentialBinding(binding);
                resolved.push(resolvedBinding);
            } else {
                resolved.push(binding);
            }
        }

        return resolved;
    }

    /**
     * Resolve a single MJDomainAuthBinding with a CredentialEntity
     * into a plain DomainAuthBinding with a concrete AuthMethod.
     */
    private async resolveCredentialBinding(
        binding: MJDomainAuthBinding
    ): Promise<DomainAuthBinding> {
        const credential = binding.Credential!;
        const credTypeName = credential.CredentialType;
        const values = this.parseCredentialValues(credential);
        const method = this.mapCredentialToAuthMethod(credTypeName, values);

        const resolved = new DomainAuthBinding();
        resolved.Domains = binding.Domains;
        resolved.Method = method;
        return resolved;
    }

    /**
     * Parse the credential's Values JSON string into a record.
     * Values is auto-decrypted by MJ's field-level encryption on load.
     */
    private parseCredentialValues(credential: CredentialEntity): Record<string, string> {
        try {
            return JSON.parse(credential.Values) as Record<string, string>;
        } catch {
            throw new Error(
                `Failed to parse credential values for "${credential.Name}". ` +
                `Ensure the credential's Values field contains valid JSON.`
            );
        }
    }

    /**
     * Map a credential type name + decrypted values to a concrete AuthMethod.
     *
     * The mapping is deterministic based on the CredentialType.Name:
     * - "API Key"                   → APIKeyHeaderAuthMethod
     * - "API Key with Endpoint"     → BearerTokenAuthMethod
     * - "Basic Auth"                → BasicAuthMethod (FormLogin default)
     * - "OAuth2 Client Credentials" → OAuthClientCredentialsAuthMethod
     */
    private mapCredentialToAuthMethod(
        credentialTypeName: string,
        values: Record<string, string>
    ): AuthMethod {
        switch (credentialTypeName) {
            case 'API Key':
                return {
                    Type: 'APIKey' as const,
                    Key: values.apiKey ?? values.key ?? '',
                    HeaderName: values.headerName ?? 'Authorization',
                    Prefix: values.prefix ?? 'Bearer ',
                };

            case 'API Key with Endpoint':
                return {
                    Type: 'Bearer' as const,
                    Token: values.apiKey ?? values.token ?? '',
                    HeaderName: values.headerName ?? 'Authorization',
                    Prefix: values.prefix ?? 'Bearer',
                };

            case 'Basic Auth':
                return {
                    Type: 'Basic' as const,
                    Username: values.username ?? '',
                    Password: values.password ?? '',
                    Strategy: 'FormLogin' as const,
                };

            case 'OAuth2 Client Credentials':
                return {
                    Type: 'OAuthClientCredentials' as const,
                    ClientId: values.clientId ?? '',
                    ClientSecret: values.clientSecret ?? '',
                    TokenUrl: values.tokenUrl ?? '',
                    Scope: values.scope,
                };

            default:
                throw new Error(
                    `Unsupported credential type for auth mapping: "${credentialTypeName}". ` +
                    `Use a DomainAuthBinding with an explicit Method instead.`
                );
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION-TO-TOOL WRAPPING
    // ═══════════════════════════════════════════════════════════

    /**
     * Wrap MJ Actions as ComputerUseTool instances.
     *
     * For each ActionRef, loads the action metadata from ActionEngineBase,
     * builds a JSON Schema from ActionParam metadata, and creates a handler
     * that routes to ActionEngineBase.RunAction().
     */
    private async wrapActionsAsTools(
        actionRefs: ActionRef[]
    ): Promise<ComputerUseTool[]> {
        const tools: ComputerUseTool[] = [];
        const actionEngine = ActionEngineBase.Instance;

        // Ensure ActionEngine is configured before accessing Actions/ActionParams
        if (!actionEngine.Loaded) {
            await actionEngine.Config(false, this.contextUser);
        }
        
        LogStatus(`ActionEngine has ${actionEngine.Actions.length} actions, ${actionEngine.ActionParams.length} action params loaded`);

        for (const ref of actionRefs) {
            const action = this.findAction(actionEngine, ref);
            if (!action) {
                LogError(`Action not found: ${ref.ActionName ?? ref.ActionId}`);
                continue;
            }

            let actionParams = this.getActionParams(actionEngine, action.ID);
            if (actionParams.length === 0) {
                // Fallback: query Action Params directly from DB when engine cache is empty
                LogStatus(`Action "${action.Name}" has 0 cached params — querying DB directly`);
                actionParams = await this.loadActionParamsFromDB(action.ID);
            }

            if (actionParams.length === 0) {
                LogStatus(`Warning: Action "${action.Name}" (ID: ${action.ID}) has 0 input params — tool schema will be empty`);
            } else {
                LogStatus(`Action "${action.Name}" has ${actionParams.length} input params: ${actionParams.map(p => p.Name).join(', ')}`);
            }

            const tool = this.buildToolFromAction(action, actionParams);
            tools.push(tool);
        }

        return tools;
    }

    /**
     * Find an action entity by ID or Name.
     */
    private findAction(
        actionEngine: ActionEngineBase,
        ref: ActionRef
    ): ActionEntity | undefined {
        if (ref.ActionId) {
            return actionEngine.Actions.find(a => a.ID === ref.ActionId);
        }
        if (ref.ActionName) {
            return actionEngine.Actions.find(a => a.Name === ref.ActionName);
        }
        return undefined;
    }

    /**
     * Get action params for a given action from the engine's cached metadata.
     * Uses case-insensitive GUID comparison because the mssql driver returns
     * lowercase GUIDs while MJ entity objects may uppercase them.
     */
    private getActionParams(
        actionEngine: ActionEngineBase,
        actionId: string
    ): ActionParamEntity[] {
        const normalizedId = actionId.trim().toUpperCase();
        return actionEngine.ActionParams.filter(
            p => p.ActionID.trim().toUpperCase() === normalizedId && (p.Type === 'Input' || p.Type === 'Both')
        );
    }

    /**
     * Fallback: load action params directly from the database via RunView.
     * Used when ActionEngineBase.ActionParams cache doesn't contain params
     * for a given action (e.g., engine was loaded before params were synced).
     */
    private async loadActionParamsFromDB(actionId: string): Promise<ActionParamEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<ActionParamEntity>(
            {
                EntityName: 'Action Params',
                ExtraFilter: `ActionID='${actionId}' AND (Type='Input' OR Type='Both')`,
                ResultType: 'entity_object',
            },
            this.contextUser
        );

        if (!result.Success) {
            LogError(`Failed to load Action Params from DB for action ${actionId}: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results;
    }

    /**
     * Build a ComputerUseTool from an ActionEntity and its params.
     */
    private buildToolFromAction(
        action: ActionEntity,
        actionParams: ActionParamEntity[]
    ): ComputerUseTool {
        const toolName = this.sanitizeToolName(action.Name);
        const inputSchema = this.buildSchemaFromActionParams(actionParams);

        return new ComputerUseTool({
            Name: toolName,
            Description: action.Description ?? action.Name,
            InputSchema: inputSchema,
            Handler: async (args: Record<string, unknown>) => {
                return this.executeActionAsTool(action, args);
            },
        });
    }

    /**
     * Execute an MJ Action via ActionEngineBase and return the result.
     */
    private async executeActionAsTool(
        action: ActionEntity,
        args: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        if (!this.contextUser) {
            throw new Error(
                `Cannot execute action "${action.Name}" as tool: ContextUser is not set. ` +
                `Ensure MJRunComputerUseParams.ContextUser is provided.`
            );
        }

        // Ensure ActionEngineServer is configured before running actions
        if (!ActionEngineServer.Instance.Loaded) {
            await ActionEngineServer.Instance.Config(false, this.contextUser);
        }

        const actionParams = Object.entries(args).map(([name, value]) => ({
            Name: name,
            Value: value,
            Type: 'Input' as const,
        }));

        const result = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: this.contextUser,
            Params: actionParams,
            Filters: [],
        });

        return {
            Success: result.Success,
            Message: result.Message,
            Outputs: result.Params?.filter(p => p.Type === 'Output') ?? [],
        };
    }

    /**
     * Sanitize action name for use as a tool name.
     * LLM function calling requires alphanumeric + underscores.
     */
    private sanitizeToolName(name: string): string {
        return name.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /**
     * Build a JSON Schema from ActionParamEntity metadata.
     * Maps ActionParam fields to JSON Schema properties.
     */
    private buildSchemaFromActionParams(params: ActionParamEntity[]): JsonSchema {
        const schema = new JsonSchema();
        schema.Required = [];

        for (const param of params) {
            const prop = new JsonSchemaProperty();
            prop.Type = this.mapValueTypeToJsonSchemaType(param.ValueType);
            prop.Description = param.Description ?? param.Name;
            schema.Properties[param.Name] = prop;

            if (param.IsRequired) {
                schema.Required.push(param.Name);
            }
        }

        return schema;
    }

    /**
     * Map MJ ActionParam.ValueType to JSON Schema type string.
     */
    private mapValueTypeToJsonSchemaType(
        valueType: string
    ): JsonSchemaType {
        switch (valueType) {
            case 'Scalar':
                return 'string';
            case 'Simple Object':
                return 'object';
            case 'BaseEntity Sub-Class':
                return 'object';
            default:
                return 'string';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MEDIA PERSISTENCE
    // ═══════════════════════════════════════════════════════════

    /**
     * Persist a step's screenshot as an AIPromptRunMedia entity.
     *
     * Links the media to the most recent prompt run (from the controller
     * call in this step). Uses InlineData for base64 storage.
     * Sets ModalityID by looking up the "Image" modality from AIEngine.
     */
    private async persistStepMedia(step: StepRecord, height: number | undefined, width: number | undefined): Promise<void> {
        if (!this.lastPromptRunId || !this.contextUser) return;

        const imageModality = AIEngine.Instance.GetModalityByName('Image');
        if (!imageModality) {
            LogError(`Cannot persist step ${step.StepNumber} media: "Image" modality not found in AIEngine`);
            return;
        }

        const md = new Metadata();
        const mediaEntity = await md.GetEntityObject<AIPromptRunMediaEntity>(
            'MJ: AI Prompt Run Medias',
            this.contextUser
        );

        mediaEntity.PromptRunID = this.lastPromptRunId;
        mediaEntity.ModalityID = imageModality.ID;
        mediaEntity.MimeType = 'image/png';
        mediaEntity.InlineData = step.Screenshot;
        mediaEntity.DisplayOrder = step.StepNumber;
        mediaEntity.Width = width ?? null;
        mediaEntity.Height = height ?? null;
        mediaEntity.DurationSeconds = 0;
        let dateTime = new Date().toLocaleString();

        mediaEntity.FileName = `ComputerUse-${dateTime}-step${step.StepNumber}`;
        mediaEntity.Description = step.ControllerReasoning;

        const saved = await mediaEntity.Save();
        if (!saved) {
            LogError(`Failed to save screenshot media for step ${step.StepNumber}: ${mediaEntity.LatestResult?.Message}`);
        }
    }

}
