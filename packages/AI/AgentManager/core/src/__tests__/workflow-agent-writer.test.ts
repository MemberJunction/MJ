/**
 * `WorkflowAgentWriter` resolves the names a workflow's steps refer to before it saves them.
 *
 * Pinned here: a failed load of those names stops the save. An empty index resolves nothing, so
 * every agent and prompt would be reported lost and every action saved pointing at nothing.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo, type RunViewParams } from '@memberjunction/core';
import { WorkflowAgentWriter } from '../workflow-agent-writer';

type NameRow = { ID: string; Name: string };
type NameLoad = { Success: boolean; Results: NameRow[]; ErrorMessage?: string };

/** The one provider call the name indexes make. */
type NameProvider = { RunViews(params: RunViewParams[]): Promise<NameLoad[]> };

/** The private step these tests drive, typed by the provider call it makes. */
type WriterInternals = {
    buildNameIndexes(context: { ContextUser: UserInfo; Provider: NameProvider }): Promise<{
        Agents: Map<string, string>;
        Actions: Map<string, string>;
        Prompts: Map<string, string>;
    }>;
};

/** True when the writer still has the step these tests drive — checked, so a rename fails here. */
function drivesNameIndexes(value: object): value is WriterInternals {
    return typeof Reflect.get(value, 'buildNameIndexes') === 'function';
}

function writer(): WriterInternals {
    const instance: object = new WorkflowAgentWriter();
    if (!drivesNameIndexes(instance)) throw new Error('WorkflowAgentWriter no longer builds name indexes.');
    return instance;
}

const provider = (loads: NameLoad[]): NameProvider => ({ RunViews: async () => loads });
const loaded = (rows: NameRow[]): NameLoad => ({ Success: true, Results: rows });

describe('WorkflowAgentWriter name indexes', () => {
    it('indexes agents, actions and prompts by lowercased name', async () => {
        const indexes = await writer().buildNameIndexes({
            ContextUser: new UserInfo(),
            Provider: provider([
                loaded([{ ID: 'agent-1', Name: 'Sage' }]),
                loaded([{ ID: 'action-1', Name: 'Send Email ' }]),
                loaded([{ ID: 'prompt-1', Name: 'Triage Decision' }]),
            ]),
        });
        expect(indexes.Agents.get('sage')).toBe('agent-1');
        expect(indexes.Actions.get('send email')).toBe('action-1');
        expect(indexes.Prompts.get('triage decision')).toBe('prompt-1');
    });

    it('refuses to go on when a load fails, naming what could not be read', async () => {
        const failing = writer().buildNameIndexes({
            ContextUser: new UserInfo(),
            Provider: provider([loaded([]), { Success: false, Results: [], ErrorMessage: 'permission denied' }, loaded([])]),
        });
        await expect(failing).rejects.toThrow(/MJ: Actions: permission denied/);
    });
});
