/**
 * The Architect checks each action ID of an agent spec: a value that is not a UUID is reported
 * as not valid and never goes into a filter, and data provider error text is not returned.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { AgentSpec, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { AgentArchitectAgent } from '../agents/architect-agent';

const VALID_ID = '11111111-2222-3333-4444-555555555555';
const MARKER = "' OR '1'='1";
const NOT_A_UUID = `${VALID_ID}${MARKER}`;

class TestArchitectAgent extends AgentArchitectAgent {
    public async TestValidateActions(actions: AgentSpec['Actions']): Promise<{ errors: string[] }> {
        return this.validateActions(actions, {} as ExecuteAgentParams);
    }
}

function actionsOf(...ids: string[]): AgentSpec['Actions'] {
    return ids.map((ActionID) => ({ ActionID })) as AgentSpec['Actions'];
}

function spyOnRunView(result: Partial<RunViewResult>): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
        Success: true,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
        ...result,
    } as RunViewResult);
}

function filtersSent(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map((call) => String((call[0] as RunViewParams).ExtraFilter ?? ''));
}

describe('AgentArchitectAgent.validateActions', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reports an action ID that is not a UUID as not valid and keeps it out of the filter', async () => {
        const spy = spyOnRunView({ Results: [{ ID: VALID_ID }] });

        const { errors } = await new TestArchitectAgent().TestValidateActions(actionsOf(VALID_ID, NOT_A_UUID));

        expect(filtersSent(spy).filter((f) => f.includes(MARKER))).toEqual([]);
        expect(errors.length).toBe(1);
    });

    it('does not return the data provider error text', async () => {
        spyOnRunView({ Success: false, Results: [], ErrorMessage: 'provider-detail-marker' });

        const { errors } = await new TestArchitectAgent().TestValidateActions(actionsOf(VALID_ID));

        expect(errors.join('\n')).not.toContain('provider-detail-marker');
        expect(errors.length).toBe(1);
    });
});
