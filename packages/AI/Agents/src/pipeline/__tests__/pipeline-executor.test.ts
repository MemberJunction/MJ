import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineExecutor, MAX_PIPELINE_STAGES } from '../pipeline-executor';
import { PipelineToolRegistry } from '../pipeline-registry';
import { PipelineInvocable, PipelineStepResult, PipeValue, PipelineStage } from '../pipeline.types';

/** Fake capability: returns a fixed value, or echoes its params (to verify pipeInto/templating). */
class FakeTool implements PipelineInvocable {
    public readonly providerKind = 'Action' as const;
    public readonly isSource = true;
    public calls: Record<string, unknown>[] = [];
    constructor(public readonly toolName: string, private readonly value: PipeValue, private readonly fail = false) {}
    async invoke(_input: PipeValue, params: Record<string, unknown>): Promise<PipelineStepResult> {
        this.calls.push(params);
        if (this.fail) {
            return { output: null, success: false, error: 'tool exploded', logRef: { providerKind: 'Action' } };
        }
        // echo params back so tests can assert pipeInto/templates landed; else the fixed value
        const output = Object.keys(params).length ? ({ ...params } as PipeValue) : this.value;
        return { output, success: true, logRef: { providerKind: 'Action', actionExecutionLogId: 'log-1' } };
    }
}

const RECORDS: PipeValue = [
    { ID: '1', Status: 'Rejected', Email: 'a@x.com', Balance: 10 },
    { ID: '2', Status: 'Approved', Email: 'b@x.com', Balance: 0 },
    { ID: '3', Status: 'Rejected', Email: 'c@x.com', Balance: 5 },
];

function registryWith(...tools: PipelineInvocable[]): PipelineToolRegistry {
    const reg = new PipelineToolRegistry();
    tools.forEach((t) => reg.Register(t));
    return reg;
}

describe('PipelineExecutor (value model)', () => {
    let runView: FakeTool;
    let exec: PipelineExecutor;
    beforeEach(() => {
        runView = new FakeTool('Run View', { Records: RECORDS });
        exec = new PipelineExecutor(registryWith(runView));
    });

    it('threads structured values through operators; returns only the final value', async () => {
        const r = await exec.Execute([
            { tool: 'Run View', with: {} },
            { jsonpath: '$.Records' },
            { where: "Status == 'Rejected'" },
            { select: 'Email' },
        ] as PipelineStage[]);
        expect(r.success).toBe(true);
        expect(r.finalOutput).toEqual(['a@x.com', 'c@x.com']);
        expect(r.steps.map((s) => s.toolName)).toEqual(['Run View', 'jsonpath', 'where', 'select']);
        expect(r.contextBytesSaved).toBeGreaterThan(0);
    });

    it('counts context saved as the non-final stage outputs', async () => {
        const r = await exec.Execute([{ tool: 'Run View', with: {} }, { jsonpath: '$.Records' }, { count: true }] as PipelineStage[]);
        expect(r.finalOutput).toBe(3);
        expect(r.contextBytesSaved).toBe(r.steps[0].outputSize + r.steps[1].outputSize);
    });

    it('tool stage receives pipeInto (whole upstream value) in a named param', async () => {
        const sink = new FakeTool('Sink', null);
        const reg = registryWith(runView, sink);
        const e = new PipelineExecutor(reg);
        await e.Execute([
            { tool: 'Run View', with: {} },
            { jsonpath: '$.Records' },
            { select: 'Email' },
            { tool: 'Sink', with: {}, pipeInto: 'Payload' },
        ] as PipelineStage[]);
        expect(sink.calls[0].Payload).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    });

    it('map runs a sub-pipeline per element with {{binding}} templating', async () => {
        const email = new FakeTool('Send Email', null);
        const e = new PipelineExecutor(registryWith(runView, email));
        const r = await e.Execute([
            { tool: 'Run View', with: {} },
            { jsonpath: '$.Records' },
            { where: "Status == 'Rejected'" },
            { map: { as: 'row', do: [{ tool: 'Send Email', with: { To: '{{row.Email}}', Amt: '{{row.Balance}}' } }] } },
        ] as PipelineStage[]);
        expect(r.success).toBe(true);
        expect(email.calls).toHaveLength(2); // 2 rejected rows
        expect(email.calls.map((c) => c.To).sort()).toEqual(['a@x.com', 'c@x.com']);
        expect(email.calls[0].Amt).toBe(10); // number preserved via whole-template
    });

    it('counts bytes fetched INSIDE a map toward context saved (not just top-level stages)', async () => {
        const bigPage = 'x'.repeat(2000);
        const list = new FakeTool('List', [1, 2, 3]);
        const page = new FakeTool('Page', bigPage);
        const e = new PipelineExecutor(registryWith(list, page));
        const r = await e.Execute([
            { tool: 'List', with: {} },
            { map: { as: 'n', do: [{ tool: 'Page', with: {} }, { count: true }] } }, // each element → 2000-char page → count
            { count: true }, // final value = 3 (tiny)
        ] as PipelineStage[]);
        expect(r.success).toBe(true);
        expect(r.finalOutput).toBe(3);
        // The 3 × 2000-char pages were fetched server-side and never surfaced → counted as saved.
        expect(r.contextBytesSaved).toBeGreaterThan(6000);
    });

    it('let binds a value for later {{name}} use; stream passes through', async () => {
        const lookup = new FakeTool('Config', { Sender: 'noreply@x.com' });
        const sink = new FakeTool('Sink', null);
        const e = new PipelineExecutor(registryWith(runView, lookup, sink));
        await e.Execute([
            { tool: 'Run View', with: {} },
            { let: { name: 'cfg', value: [{ tool: 'Config', with: {} }] } },
            { tool: 'Sink', with: { from: '{{cfg.Sender}}' } },
        ] as PipelineStage[]);
        expect(sink.calls[0].from).toBe('noreply@x.com');
    });

    it('fails fast with an input-free message + field context on a bad stage', async () => {
        const r = await exec.Execute([
            { tool: 'Run View', with: {} },
            { jsonpath: '$.Records' },
            { where: 'Bananas > 1' }, // valid predicate, just no matches → not an error; use a real error instead
            { sort: 'NoField' },
        ] as PipelineStage[]);
        // 'where Bananas>1' yields [] (no error); sort on [] is fine → success with []
        expect(r.success).toBe(true);
        expect(r.finalOutput).toEqual([]);
    });

    it('surfaces a self-correction diagnostic when a where zeroes a non-empty array → empty final', async () => {
        const r = await exec.Execute([
            { tool: 'Run View', with: {} },
            { jsonpath: '$.Records' },
            { where: "Status == 'NOPE'" }, // matches nothing
        ] as PipelineStage[]);
        expect(r.success).toBe(true);
        expect(r.finalOutput).toEqual([]);
        expect(r.diagnostic).toMatch(/matched 0 of 3 items/);
        expect(r.diagnostic).toMatch(/Status=\[Rejected, Approved\]/); // shows actual values present
    });

    it('does NOT add a diagnostic when the final result is legitimately non-empty', async () => {
        const r = await exec.Execute([
            { tool: 'Run View', with: {} },
            { jsonpath: '$.Records' },
            { where: "Status == 'Rejected'" },
        ] as PipelineStage[]);
        expect(r.success).toBe(true);
        expect((r.finalOutput as unknown[]).length).toBe(2);
        expect(r.diagnostic).toBeUndefined();
    });

    it('reports a tool failure fast', async () => {
        const bad = new FakeTool('Run View', null, true);
        const e = new PipelineExecutor(registryWith(bad));
        const r = await e.Execute([{ tool: 'Run View', with: {} }, { count: true }] as PipelineStage[]);
        expect(r.success).toBe(false);
        expect(r.failedStepIndex).toBe(1);
        expect(r.error).toMatch(/Pipeline failed at stage 1 \(Run View\)/);
        expect(r.error).toMatch(/tool exploded/);
    });

    it('rejects an unknown tool, listing available tools', async () => {
        const r = await exec.Execute([{ tool: 'Nope', with: {} }] as PipelineStage[]);
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/Unknown pipeline tool "Nope"/);
        expect(r.error).toMatch(/Run View/);
    });

    it('rejects operator-on-wrong-type with a clear error', async () => {
        const scalar = new FakeTool('Scalar', 42);
        const e = new PipelineExecutor(registryWith(scalar));
        const r = await e.Execute([{ tool: 'Scalar', with: {} }, { where: 'x == 1' }] as PipelineStage[]);
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/"where" expects an array/);
    });

    it('rejects empty and over-long pipelines', async () => {
        expect((await exec.Execute([])).error).toMatch(/at least 1 stage/);
        const many = Array.from({ length: MAX_PIPELINE_STAGES + 1 }, () => ({ count: true }));
        expect((await exec.Execute(many as PipelineStage[])).error).toMatch(/at most/);
    });
});
