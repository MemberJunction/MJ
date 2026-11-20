/**
 * `TaskGraph.Cancel` and `TaskGraph.GetStatus`: who may act on a workflow run, and which IDs they accept.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

const hoisted = vi.hoisted(() => ({
    cancel: vi.fn(),
}));

vi.mock('../TaskGraphService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../TaskGraphService')>();
    return {
        ...actual,
        TaskGraphService: class {
            Cancel(...args: unknown[]) {
                return hoisted.cancel(...args);
            }
        },
    };
});

import { TaskGraphCancelServerOperation, TaskGraphGetStatusServerOperation } from '../operations/TaskGraphOperations';

const GRAPH_ID = '6F1D2C3B-4A5E-4F60-8172-93A4B5C6D7E8';
const OWNER_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_USER = { ID: '99999999-8888-4777-8666-555555555555', Type: 'User' } as unknown as UserInfo;

/** A provider whose `MJ: Tasks` rows are the graph's parent, submitted by `OWNER_ID`. */
function provider(): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => ({
            ID: GRAPH_ID,
            Status: 'In Progress',
            InputPayload: JSON.stringify({ submittedByUserID: OWNER_ID }),
            Load: async () => true,
        })),
    } as unknown as IMetadataProvider;
}

type Execute = (input: Record<string, unknown>, p: IMetadataProvider, u: UserInfo) => Promise<Record<string, unknown>>;

function execute(op: object, input: Record<string, unknown>, user: UserInfo): Promise<Record<string, unknown>> {
    const callable = op as unknown as { InternalExecute: Execute };
    return callable.InternalExecute.call(op, input, provider(), user);
}

const runView = vi.fn();

beforeEach(() => {
    hoisted.cancel.mockReset().mockResolvedValue({ Success: true, Cancelled: true, UncancelledTaskNames: [] });
    runView.mockReset().mockResolvedValue({ Success: true, Results: [] });
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TaskGraph.Cancel', () => {
    it("refuses a caller who does not own the workflow run, and cancels nothing", async () => {
        const output = await execute(new TaskGraphCancelServerOperation(), { parentTaskID: GRAPH_ID }, OTHER_USER);

        expect(hoisted.cancel).not.toHaveBeenCalled();
        expect(output).toMatchObject({ success: false });
    });
});

describe('TaskGraph.GetStatus', () => {
    it("refuses a caller who does not own the workflow run, and reads no steps", async () => {
        const output = await execute(new TaskGraphGetStatusServerOperation(), { parentTaskID: GRAPH_ID }, OTHER_USER);

        expect(runView).not.toHaveBeenCalled();
        expect(output).toMatchObject({ success: false });
    });
});

describe('parentTaskID must be a UUID', () => {
    const OWNER_TYPE_USER = { ID: OWNER_ID, Type: 'Owner' } as unknown as UserInfo;
    const NOT_A_UUID = "0' AND 'marker'='marker";

    it('GetStatus refuses an ID that is not a UUID and builds no filter from it', async () => {
        const output = await execute(new TaskGraphGetStatusServerOperation(), { parentTaskID: NOT_A_UUID }, OWNER_TYPE_USER);

        expect(runView).not.toHaveBeenCalled();
        expect(output).toMatchObject({ success: false });
    });

    it('Cancel refuses an ID that is not a UUID and cancels nothing', async () => {
        const output = await execute(new TaskGraphCancelServerOperation(), { parentTaskID: NOT_A_UUID }, OWNER_TYPE_USER);

        expect(hoisted.cancel).not.toHaveBeenCalled();
        expect(output).toMatchObject({ success: false });
    });
});
