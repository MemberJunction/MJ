/**
 * Tests for `TaskGraphUserResolver` — how the task-graph dispatcher finds the person a graph's steps
 * run as.
 *
 * The dispatcher runs as the service account but runs each step as the graph's submitter. It fails
 * a step whose submitter it cannot resolve rather than falling back to the service account, so this
 * resolver must answer from the server's user cache and must turn every failure into "not found",
 * never into a throw the dispatcher would have to interpret.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
}));

const findUser = vi.fn();
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { FindUser: (criteria: { ID?: string }) => findUser(criteria) } },
}));

import { LogError } from '@memberjunction/core';
import { TaskGraphUserResolver } from '../services/TaskGraphUserResolver';

const REQUESTER = { ID: 'requester-1', Name: 'Ursula', IsActive: true } as UserInfo;

describe('TaskGraphUserResolver', () => {
    beforeEach(() => {
        findUser.mockReset();
        vi.mocked(LogError).mockClear();
    });

    it('answers with the cached user, looked up by ID', async () => {
        findUser.mockResolvedValue(REQUESTER);

        const user = await new TaskGraphUserResolver().FindUserByID('requester-1');

        expect(user).toBe(REQUESTER);
        expect(findUser).toHaveBeenCalledWith({ ID: 'requester-1' });
    });

    it('answers undefined for a user neither the cache nor the database has', async () => {
        findUser.mockResolvedValue(undefined);

        expect(await new TaskGraphUserResolver().FindUserByID('nobody')).toBeUndefined();
    });

    it('turns a failed lookup into "not found" and logs it, rather than throwing', async () => {
        findUser.mockRejectedValue(new Error('connection lost'));

        await expect(new TaskGraphUserResolver().FindUserByID('requester-1')).resolves.toBeUndefined();
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('connection lost'));
    });
});
