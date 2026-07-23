/**
 * ai-verify.test.ts — WI4 regression guard for issue #3251's secondary item.
 *
 * fetchById's bounded poll used to fail with "... not found after bounded poll (fire-and-forget
 * write never landed)" — asserting data loss as fact. In the release build the writes DID land
 * (42 + 186 rows); the poll window just closed first on a loaded box. These tests pin the corrected
 * contract: the failure states the actual bound it waited and names the MJ_IT_FETCH_POLL_MS knob,
 * and that knob actually resizes the poll budget.
 *
 * The tests set a SHORT MJ_IT_FETCH_POLL_MS so the real-timer poll finishes fast — which is itself
 * the proof the knob is honored (the pre-fix code ignored it and always polled ~12s over 24 tries).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

// RunView is used as `new RunView().RunView(...)`; a class mock whose RunView always returns an
// empty successful result forces fetchById to exhaust its poll and throw.
const runViewMock = vi.hoisted(() => vi.fn(async () => ({ Success: true, Results: [], ErrorMessage: '' })));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: class { RunView = runViewMock; } };
});

import { verifyPromptRun } from '../ai-verify';

const user = { ID: 'user-1' } as Partial<UserInfo> as UserInfo;

describe('ai-verify fetchById bounded poll (WI4, #3251)', () => {
    beforeEach(() => {
        runViewMock.mockClear();
    });
    afterEach(() => {
        delete process.env.MJ_IT_FETCH_POLL_MS;
    });

    it('failure states the actual bound waited and names MJ_IT_FETCH_POLL_MS (not "write never landed")', async () => {
        process.env.MJ_IT_FETCH_POLL_MS = '500';
        const err: Error = await verifyPromptRun('missing-id', user).catch((e: Error) => e);
        expect(err.message).toMatch(/within 500ms/);
        expect(err.message).toMatch(/MJ_IT_FETCH_POLL_MS/);
        expect(err.message).not.toMatch(/write never landed/);
    });

    it('MJ_IT_FETCH_POLL_MS resizes the poll budget (fewer RunView attempts)', async () => {
        process.env.MJ_IT_FETCH_POLL_MS = '1000';
        await verifyPromptRun('missing-id', user).catch(() => undefined);
        // 1000ms budget / 500ms interval = 2 attempts (vs. the 24 of the 12000ms default the
        // pre-fix code always ran, which ignored this env var entirely).
        expect(runViewMock).toHaveBeenCalledTimes(2);
    });
});
