import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentStepExecutionHelper } from '../helpers/steps/AgentStepExecutionHelper';
import { AgentStepTypeRegistry } from '../helpers/steps/AgentStepTypeRegistry';
import { AgentStepValidationHelper } from '../helpers/steps/AgentStepValidationHelper';
import { BaseAgentStepHandler } from '../helpers/steps/BaseAgentStepHandler';
import { ValidateCustomStepDataAgainstConfigSchema } from '../helpers/steps/CustomStepConfigSchemaValidator';
import { AgentSubAgentValidationHelper } from '../helpers/subagents/AgentSubAgentValidationHelper';
import { AgentPayloadHelper } from '../helpers/payload/AgentPayloadHelper';

const APPROVAL_SCHEMA = JSON.stringify({
    type: 'object',
    required: ['approverRole', 'reason'],
    additionalProperties: false,
    properties: {
        approverRole: { type: 'string', enum: ['Finance', 'Legal', 'Security'] },
        reason: { type: 'string', minLength: 5 },
        urgency: { type: 'integer', minimum: 1, maximum: 5 },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    },
});

class MockApprovalStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'ApprovalGate';
    public override readonly AllowedInUnapprovedPlanMode = true;
    public ExecutedCount = 0;
    public ValidatedCount = 0;

    public override async Validate<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>
    ): Promise<BaseAgentNextStep<P>> {
        this.ValidatedCount++;
        return nextStep;
    }

    public override async Execute<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>
    ): Promise<BaseAgentNextStep<P>> {
        this.ExecutedCount++;
        return { ...previousDecision, step: 'Success', terminate: true };
    }
}

function makeMockRunContext(): {
    ctx: AgentRunContext;
    logError: ReturnType<typeof vi.fn>;
} {
    const logError = vi.fn();
    const ctx = {
        PlanModeActive: false,
        PlanApproved: false,
        GeneralValidationRetryCount: 0,
        AgentConfig: { agentType: { Name: 'Loop' } },
        AgentTypeInstance: {
            PreProcessNextStep: vi.fn().mockResolvedValue(null),
        },
        Hooks: {
            LogError: logError,
            LogStatus: vi.fn(),
            CheckTreeBudgetLimit: vi.fn().mockReturnValue({ exceeded: false }),
        },
    } as unknown as AgentRunContext;
    return { ctx, logError };
}

describe('R2-12: AIAgentStepType.ConfigSchema validation', () => {
    afterEach(() => {
        AgentStepTypeRegistry.Instance.ClearProgrammaticRegistrations();
        vi.restoreAllMocks();
    });

    it('validates customStepData against ConfigSchema (required, type, enum, bounds, items, additionalProperties)', () => {
        expect(
            ValidateCustomStepDataAgainstConfigSchema(APPROVAL_SCHEMA, {
                approverRole: 'Finance',
                reason: 'Budget > $10k',
                urgency: 3,
                tags: ['q4'],
            })
        ).toEqual({ Valid: true, Errors: [] });

        // Empty or null schema allows anything
        expect(ValidateCustomStepDataAgainstConfigSchema(null, undefined)).toEqual({ Valid: true, Errors: [] });
        expect(ValidateCustomStepDataAgainstConfigSchema('   ', { anything: true })).toEqual({ Valid: true, Errors: [] });

        // Missing required fields + unexpected key + invalid enum + out-of-range integer
        const invalid = ValidateCustomStepDataAgainstConfigSchema(APPROVAL_SCHEMA, {
            approverRole: 'Engineering',
            reason: 'hi',
            urgency: 9,
            extraField: true,
        });
        expect(invalid.Valid).toBe(false);
        expect(invalid.Errors.some((e) => e.includes('approverRole'))).toBe(true);
        expect(invalid.Errors.some((e) => e.includes('minLength'))).toBe(true);
        expect(invalid.Errors.some((e) => e.includes('maximum'))).toBe(true);
        expect(invalid.Errors.some((e) => e.includes('extraField'))).toBe(true);

        // Missing customStepData entirely when schema requires an object
        const missing = ValidateCustomStepDataAgainstConfigSchema(APPROVAL_SCHEMA, undefined);
        expect(missing.Valid).toBe(false);
        expect(missing.Errors[0]).toContain('expected type object, got undefined');

        // Malformed ConfigSchema JSON fails closed
        const malformed = ValidateCustomStepDataAgainstConfigSchema('{bad json', {});
        expect(malformed.Valid).toBe(false);
        expect(malformed.SchemaError).toContain('Invalid ConfigSchema JSON');
    });

    it('rejects invalid customStepData in AgentStepValidationHelper.ValidateNextStep before calling Handler.Validate', async () => {
        const handler = new MockApprovalStepHandler();
        AgentStepTypeRegistry.Instance.RegisterStepType({
            StepKey: 'ApprovalGate',
            DriverClass: 'MockApprovalStepHandler',
            AppliesTo: 'Loop',
            AllowedInUnapprovedPlanMode: true,
            ConfigSchema: APPROVAL_SCHEMA,
            FallbackClass: class extends MockApprovalStepHandler {
                constructor() {
                    super();
                    return handler;
                }
            },
        });

        const { ctx, logError } = makeMockRunContext();
        const validator = new AgentStepValidationHelper();
        const params = { agent: { ID: 'a1', Name: 'ApprovalAgent' } } as ExecuteAgentParams;
        const agentRun = {} as MJAIAgentRunEntityExtended;
        const currentStep = {} as MJAIAgentRunStepEntityExtended;

        // Invalid customStepData -> structured Retry, Handler.Validate never invoked
        const rejected = await validator.ValidateNextStep(
            ctx,
            params,
            { step: 'ApprovalGate', terminate: false, customStepData: { approverRole: 'Unknown' } },
            {},
            agentRun,
            currentStep
        );
        expect(rejected.step).toBe('Retry');
        expect(rejected.terminate).toBe(false);
        expect(rejected.errorMessage).toContain("Custom step 'ApprovalGate'");
        expect(rejected.errorMessage).toContain('ConfigSchema');
        expect(rejected.retryInstructions).toContain("missing required property 'reason'");
        expect(ctx.GeneralValidationRetryCount).toBe(1);
        expect(logError).toHaveBeenCalledTimes(1);
        expect(handler.ValidatedCount).toBe(0);

        // Valid customStepData -> proceeds to Handler.Validate
        const validStep: BaseAgentNextStep = {
            step: 'ApprovalGate',
            terminate: false,
            customStepData: { approverRole: 'Legal', reason: 'Contract signature required' },
        };
        const accepted = await validator.ValidateNextStep(ctx, params, validStep, {}, agentRun, currentStep);
        expect(accepted.step).toBe('ApprovalGate');
        expect(handler.ValidatedCount).toBe(1);
    });

    it('blocks direct ExecuteNextStep dispatch when customStepData violates ConfigSchema (defense in depth)', async () => {
        const handler = new MockApprovalStepHandler();
        AgentStepTypeRegistry.Instance.RegisterStepType({
            StepKey: 'ApprovalGate',
            DriverClass: 'MockApprovalStepHandler',
            AppliesTo: 'Both',
            AllowedInUnapprovedPlanMode: true,
            ConfigSchema: APPROVAL_SCHEMA,
            FallbackClass: class extends MockApprovalStepHandler {
                constructor() {
                    super();
                    return handler;
                }
            },
        });

        const { ctx } = makeMockRunContext();
        const execHelper = new AgentStepExecutionHelper();
        const params = { agent: { ID: 'a1', Name: 'FlowAgent' }, payload: { ok: true } } as ExecuteAgentParams;
        const config = {} as AgentConfiguration;

        const failed = await execHelper.ExecuteNextStep(
            ctx,
            params,
            config,
            { step: 'ApprovalGate', terminate: false, customStepData: { approverRole: 'Invalid' } },
            1
        );
        expect(failed.step).toBe('Failed');
        expect(failed.terminate).toBe(true);
        expect(failed.errorMessage).toContain('ConfigSchema');
        expect(handler.ExecutedCount).toBe(0);

        const succeeded = await execHelper.ExecuteNextStep(
            ctx,
            params,
            config,
            { step: 'ApprovalGate', terminate: false, customStepData: { approverRole: 'Security', reason: 'Key rotation review' } },
            2
        );
        expect(succeeded.step).toBe('Success');
        expect(handler.ExecutedCount).toBe(1);
    });
});

describe('R2-10: Remaining cascade columns wired through ResolveEffectiveAgentProperties', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves ChatHandlingOption, DefaultArtifactTypeID, ArtifactCreationMode, and PayloadSelfWritePaths from EffectiveAgentProperties with raw fallback', () => {
        const agent = {
            ID: '11111111-1111-4111-8111-111111111111',
            Name: 'Derived Agent',
            ChatHandlingOption: null,
            ArtifactCreationMode: 'Always',
            DefaultArtifactTypeID: null,
            PayloadSelfWritePaths: null,
        } as unknown as MJAIAgentEntityExtended;

        vi.spyOn(AIEngine.Instance, 'ResolveEffectiveAgentProperties').mockReturnValue({
            ChatHandlingOption: 'Consult',
            ArtifactCreationMode: 'System Only',
            DefaultArtifactTypeID: '22222222-2222-4222-8222-222222222222',
            PayloadSelfWritePaths: ['draft.*'],
        } as ReturnType<typeof AIEngine.Instance.ResolveEffectiveAgentProperties>);

        const subValidation = new AgentSubAgentValidationHelper();
        expect(subValidation.ResolveSubAgentChatHandlingOption(agent)).toBe('Consult');

        const stepExec = new AgentStepExecutionHelper();
        const { ctx } = makeMockRunContext();
        expect(
            stepExec.ResolveChildPayloadArtifactTypeID(ctx, { success: true } as never, agent)
        ).toBe('22222222-2222-4222-8222-222222222222');

        // Also verify PayloadHelper reads effective PayloadSelfWritePaths without raw column set
        const payloadHelper = new AgentPayloadHelper();
        const applyChange = vi.fn().mockReturnValue({ result: {}, warnings: [] });
        const payloadCtx = {
            PromptTurnCount: 1,
            PayloadManager: { applyAgentChangeRequest: applyChange },
        } as unknown as AgentRunContext;
        payloadHelper.ApplyTurnPayloadChange(
            payloadCtx,
            { agent } as ExecuteAgentParams,
            { step: 'Success', terminate: true, payloadChangeRequest: { newElements: { draft: 'ok' } } },
            {},
            false
        );
        expect(applyChange).toHaveBeenCalledWith(
            {},
            expect.anything(),
            expect.objectContaining({ allowedPaths: ['draft.*'] })
        );
    });
});
