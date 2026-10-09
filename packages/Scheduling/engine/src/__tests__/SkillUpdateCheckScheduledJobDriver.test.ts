/**
 * SkillUpdateCheckScheduledJobDriver — one skill whose stored source is refused (re-validated before
 * any fetch, so an http or private URL on the row fails here) is counted as Failed, and the sweep
 * still checks the rest. The service is module-mocked; its own behavior is tested in ai-agents.
 */
import { describe, it, expect, vi } from 'vitest';

const { checkSkill } = vi.hoisted(() => ({ checkSkill: vi.fn() }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    Metadata: { Provider: {} },
    RunView: { FromMetadataProvider: vi.fn() },
    ValidationResult: class { Success = false; },
}));
vi.mock('@memberjunction/ai-agents', () => ({ SkillImportExportService: { CheckSkillForUpdate: checkSkill } }));
vi.mock('../BaseScheduledJob', () => ({ BaseScheduledJob: class {} }));

import { SkillUpdateCheckScheduledJobDriver } from '../drivers/SkillUpdateCheckScheduledJobDriver';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';

describe('SkillUpdateCheckScheduledJobDriver.checkAll', () => {
    it('counts a refused stored source as Failed and keeps checking the others', async () => {
        checkSkill
            .mockRejectedValueOnce(new Error('Skill sources must be https URLs: "http://169.254.169.254/"'))
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const skills = ['tampered', 'changed', 'same'].map(Name => ({ ID: Name, Name })) as unknown as MJAISkillEntity[];
        const heartbeat = vi.fn(async () => undefined);
        const driver = new SkillUpdateCheckScheduledJobDriver() as unknown as {
            checkAll: (s: MJAISkillEntity[], c: ScheduledJobExecutionContext) => Promise<{ Checked: number; MarkedPending: string[]; Failed: string[] }>;
        };

        const tally = await driver.checkAll(skills, { heartbeat } as unknown as ScheduledJobExecutionContext);

        expect(tally).toEqual({ Checked: 2, MarkedPending: ['changed'], Failed: ['tampered'] });
        expect(checkSkill).toHaveBeenCalledTimes(3);
        expect(checkSkill.mock.calls.every(call => call.length === 1)).toBe(true);
        expect(heartbeat).toHaveBeenCalledTimes(3);
    });
});
