/**
 * Pins what the runtime tells the operator when an adapter enforces only PART of a permission policy.
 *
 * Gemini CLI applies the posture (`--approval-mode`) but not the allow/deny lists. Reporting the
 * posture as "ignored" would be as misleading as the old silence, and the opposite — saying nothing
 * about ignored lists — would let an operator believe a deny list is gating something.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogError, LogStatus } from '@memberjunction/core';
import { HarnessAgentBase } from '../HarnessAgentBase';
import { GeminiCliAdapter } from '../adapters/GeminiCliAdapter';
import { CodexAdapter } from '../adapters/CodexAdapter';
import { BaseHarnessAdapter } from '../adapters/BaseHarnessAdapter';
import { HarnessPermissionPolicy } from '../types';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

function warn(adapter: BaseHarnessAdapter, policy: HarnessPermissionPolicy): void {
    const agent = new HarnessAgentBase();
    (agent as unknown as { adapter: BaseHarnessAdapter }).adapter = adapter;
    (agent as unknown as { warnOnUnenforceablePolicy(n: string, p: HarnessPermissionPolicy): void }).warnOnUnenforceablePolicy('Test', policy);
}

const logged = (fn: typeof LogError | typeof LogStatus): string => vi.mocked(fn).mock.calls.map((c) => String(c[0])).join('\n');

describe('HarnessAgentBase.warnOnUnenforceablePolicy with partial enforcement', () => {
    beforeEach(() => {
        vi.mocked(LogError).mockClear();
        vi.mocked(LogStatus).mockClear();
    });

    it('describes posture-only enforcement as informational when no lists are configured', () => {
        warn(new GeminiCliAdapter(), { Posture: 'auto' });
        expect(vi.mocked(LogError)).not.toHaveBeenCalled();
        expect(logged(LogStatus)).toMatch(/only PARTLY enforced.*--approval-mode/);
    });

    it('raises an error when allow/deny lists are configured but cannot be enforced', () => {
        warn(new GeminiCliAdapter(), { Posture: 'auto', DisallowedTools: ['Bash(rm:*)'] });
        expect(logged(LogError)).toMatch(/only PARTLY enforced.*allow\/deny lists, which are being ignored/);
    });

    it('still reports the whole policy as ignored for an adapter that applies none of it', () => {
        warn(new CodexAdapter(), { Posture: 'auto' });
        expect(logged(LogError)).toMatch(/does not apply MJ permission policies/);
    });
});
