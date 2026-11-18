/**
 * `TaskGraphService.Submit` writes the submitting run's security envelope to the `SecurityEnvelope`
 * column of the parent and of every child (S9), and refuses an envelope it could not read back.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import {
    ParseTaskSecurityEnvelope,
    TASK_SECURITY_ENVELOPE_VERSION,
    type TaskGraphSpec,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { TaskGraphService } from '../TaskGraphService';

const TEST_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Tester', IsActive: true } as UserInfo;
const WORKFLOW_TYPE_ID = '11111111-1111-4111-8111-111111111111';

type SavedRow = { ID: string; InputPayload?: string | null; Configuration?: string | null; SecurityEnvelope?: string | null };

function fakeProvider(saved: SavedRow[]): IMetadataProvider {
    let counter = 0;
    return {
        GetEntityObject: vi.fn(async (entityName: string) => {
            const row: SavedRow & { NewRecord: () => void; Save: () => Promise<boolean>; Load: () => Promise<boolean> } = {
                ID: `00000000-0000-4000-8000-00000000010${++counter}`,
                NewRecord: () => undefined,
                Load: async () => true,
                Save: async () => {
                    if (entityName === 'MJ: Tasks') saved.push(row);
                    return true;
                },
            };
            return row;
        }),
    } as unknown as IMetadataProvider;
}

const SPEC: TaskGraphSpec = {
    workflowName: 'Scoped Workflow',
    continuation: 'none',
    tasks: [
        { tempId: 'n1', name: 'One', kind: 'Action', configuration: { actionName: 'Action One' } },
        { tempId: 'n2', name: 'Two', kind: 'Action', configuration: { actionName: 'Action One' }, dependsOn: ['n1'] },
    ],
};

describe('TaskGraphService.Submit security envelope (S9)', () => {
    afterEach(() => vi.restoreAllMocks());

    function stubRunView(): void {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Task Types') return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
                if (params.EntityName === 'MJ: Actions') return { Success: true, Results: [{ ID: 'act-1', Name: 'Action One' }] };
                return { Success: true, Results: [] };
            }),
        } as unknown as RunView);
    }

    it('writes the envelope to the column of the parent and every child, and nowhere else', async () => {
        stubRunView();
        const saved: SavedRow[] = [];
        const envelope: TaskSecurityEnvelope = {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            IsRunTainted: true,
            RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-A', SecondaryScopes: null },
        };
        const result = await new TaskGraphService().Submit(SPEC, { Provider: fakeProvider(saved), ContextUser: TEST_USER, SecurityEnvelope: envelope });

        expect(result.Success).toBe(true);
        expect(saved).toHaveLength(3);
        for (const row of saved) {
            expect(ParseTaskSecurityEnvelope(row.SecurityEnvelope)).toEqual({ Status: 'Valid', Envelope: envelope });
            expect(`${row.InputPayload ?? ''}${row.Configuration ?? ''}`).not.toMatch(/securityEnvelope|IsRunTainted/i);
        }
    });

    it('refuses, before writing anything, an envelope that would not read back', async () => {
        stubRunView();
        const saved: SavedRow[] = [];
        const unreadable = { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false, Audience: { ReaderUserIDs: [] } } as TaskSecurityEnvelope;
        const result = await new TaskGraphService().Submit(SPEC, { Provider: fakeProvider(saved), ContextUser: TEST_USER, SecurityEnvelope: unreadable });

        expect(result.Success).toBe(false);
        expect(saved).toHaveLength(0);
    });

    it('leaves the column empty for a run with no constraints', async () => {
        stubRunView();
        const saved: SavedRow[] = [];
        await new TaskGraphService().Submit(SPEC, { Provider: fakeProvider(saved), ContextUser: TEST_USER });
        expect(saved.every((row) => row.SecurityEnvelope == null)).toBe(true);
    });
});
