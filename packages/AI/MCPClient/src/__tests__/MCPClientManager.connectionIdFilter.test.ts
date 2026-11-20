/**
 * @fileoverview A connection ID must be a UUID before it reaches a RunView filter.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { MCPClientManager } from '../MCPClientManager.js';

const MARKER = "' OR '1'='1";
const NOT_A_UUID = `11111111-2222-3333-4444-555555555555${MARKER}`;
const contextUser = { ID: '99999999-8888-7777-6666-555555555555', UserRoles: [] } as unknown as UserInfo;

function spyOnRunView(): ReturnType<typeof vi.spyOn> {
    const result: RunViewResult = {
        Success: true,
        Results: [{ ID: '11111111-2222-3333-4444-555555555555', MCPServerID: '22222222-3333-4444-5555-666666666666' }],
        RowCount: 1,
        TotalRowCount: 1,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
    };
    return vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(result);
}

function filtersSent(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map((call) => String((call[0] as RunViewParams).ExtraFilter ?? ''));
}

describe('MCPClientManager connection ID filters', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('connect refuses a connection ID that is not a UUID before any filter is built', async () => {
        const spy = spyOnRunView();

        await expect(new MCPClientManager().connect(NOT_A_UUID, { contextUser })).rejects.toThrow();

        expect(filtersSent(spy).filter((f) => f.includes(MARKER))).toEqual([]);
    });

    it('GetOAuthConnectionStatus does not put a non-UUID connection ID into a filter', async () => {
        const spy = spyOnRunView();

        await new MCPClientManager().GetOAuthConnectionStatus(NOT_A_UUID, contextUser);

        expect(filtersSent(spy).filter((f) => f.includes(MARKER))).toEqual([]);
    });
});
