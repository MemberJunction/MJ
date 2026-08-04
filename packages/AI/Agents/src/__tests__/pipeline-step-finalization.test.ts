import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';

// Quiet the framework loggers.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

// Force the executor to THROW (e.g. a tool returns a non-serializable value that trips the
// executor's JSON byte-accounting). Everything else from the pipeline module stays real.
vi.mock('../pipeline', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        PipelineExecutor: class {
            constructor(_registry: unknown) {}
            async Execute(_stages: unknown): Promise<never> {
                throw new Error('non-serializable tool output');
            }
        },
    };
});

// Mock step entity capturing the fields create/finalize assign.
class MockStepEntity {
    public ID: string;
    public AgentRunID?: string;
    public StepNumber?: number;
    public StepType?: string;
    public StepName?: string;
    public TargetID?: string | null;
    public TargetLogID?: string | null;
    public ParentID?: string | null;
    public Status?: string;
    public StartedAt?: Date;
    public CompletedAt?: Date | null;
    public Success?: boolean;
    public ErrorMessage?: string | null;
    public PayloadAtStart?: string | null;
    public PayloadAtEnd?: string | null;
    public InputData?: string;
    public OutputData?: string;

    constructor(id: string) {
        this.ID = id;
    }

    public NewRecord(): void {
        // no-op: the mock already has a client-side ID from the constructor
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

class TestPipelineAgent extends BaseAgent {
    // Avoid touching the DB/engine when assembling the tool registry.
    protected override buildPipelineRegistry(): any {
        return {};
    }

    public async testExecutePipelineAsStep(pipeline: any, params: any) {
        return (this as any).executePipelineAsStep(pipeline, params);
    }
}

describe('executePipelineAsStep — failure finalization', () => {
    let agent: TestPipelineAgent;
    let created: MockStepEntity[];

    beforeEach(() => {
        agent = new TestPipelineAgent();
        created = [];

        (agent as any)._activeProvider = {
            GetEntityObject: vi.fn().mockImplementation(async () => {
                const e = new MockStepEntity(`mock-step-${created.length + 1}`);
                created.push(e);
                return e;
            }),
        };
        (agent as any)._agentRun = { ID: 'mock-run-id', Steps: [] };
        (agent as any)._agentHierarchy = [];
        (agent as any)._depth = 0;
    });

    it('finalizes the step as Failed (never leaves it Running) when the executor throws', async () => {
        const result = await agent.testExecutePipelineAsStep(
            { steps: [{ tool: 'Run View', with: {} }] },
            { contextUser: {} },
        );

        // The created pipeline step must NOT be stuck on 'Running'.
        expect(created).toHaveLength(1);
        const step = created[0];
        expect(step.Status).toBe('Failed');
        expect(step.CompletedAt).toBeInstanceOf(Date);
        expect(step.Success).toBe(false);
        expect(step.ErrorMessage).toMatch(/Pipeline crashed/);
        expect(step.ErrorMessage).toMatch(/non-serializable tool output/);

        // And the returned result reflects the failure so the caller injects an error message.
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Pipeline crashed/);
    });
});
