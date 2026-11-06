import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hostname } from 'os';

const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logErrorMock };
});

import { HostInstanceIdentity } from '../agentSessions/HostInstance.js';

/** A fresh copy of the module: no port set, no identity read yet. */
async function freshHostInstanceModule(): Promise<typeof import('../agentSessions/HostInstance.js')> {
    vi.resetModules();
    return import('../agentSessions/HostInstance.js');
}

beforeEach(() => {
    logErrorMock.mockReset();
});

describe('HostInstanceIdentity', () => {
    const ours = new HostInstanceIdentity('build-01', '4000', 101, 'boot-ours');

    it('stamps hostname:port:pid:bootId, and every boot of the instance shares hostname:port:', () => {
        expect(ours.GetHostInstanceID()).toBe('build-01:4000:101:boot-ours');
        expect(ours.GetInstancePrefix()).toBe('build-01:4000:');
    });

    describe('IsPriorBoot', () => {
        it('is true for an earlier boot of the same instance, including one whose pid the OS reused', () => {
            expect(ours.IsPriorBoot('build-01:4000:99:boot-before')).toBe(true);
            expect(ours.IsPriorBoot('build-01:4000:101:boot-before')).toBe(true);
        });

        it.each([
            ['this boot', 'build-01:4000:101:boot-ours'],
            ['another MJAPI on the same host (another port)', 'build-01:4100:202:boot-other'],
            ['an MJAPI on another host', 'build-02:4000:101:boot-other'],
            ['the format before the port was added, with a pid equal to the port', 'build-01:4000:boot-before'],
            ['no id', null],
            ['an empty id', ''],
        ])('is false for %s', (_case, hostInstanceID) => {
            expect(ours.IsPriorBoot(hostInstanceID)).toBe(false);
        });

        it("matches a host name exactly, though a SQL LIKE reads its '_' as any character", () => {
            const underscored = new HostInstanceIdentity('web_1', '4000', 7, 'boot-ours');
            expect(underscored.IsPriorBoot('web_1:4000:8:boot-before')).toBe(true);
            expect(underscored.IsPriorBoot('web-1:4000:8:boot-before')).toBe(false);
        });
    });
});

describe('the current host instance', () => {
    it('carries the port SetHostInstancePort set before it was first read', async () => {
        const hostInstance = await freshHostInstanceModule();
        hostInstance.SetHostInstancePort(4100);

        const current = hostInstance.GetCurrentHostInstance();
        expect(current.GetHostInstanceID()).toBe(`${hostname()}:4100:${process.pid}:${hostInstance.GetBootID()}`);
        expect(current.GetInstancePrefix()).toBe(`${hostname()}:4100:`);
        expect(hostInstance.GetHostInstanceID()).toBe(current.GetHostInstanceID());
    });

    it('is this process alone (pid-<pid>) when no port was set', async () => {
        const hostInstance = await freshHostInstanceModule();

        expect(hostInstance.GetCurrentHostInstance().InstanceKey).toBe(`pid-${process.pid}`);
        expect(hostInstance.GetHostInstanceID()).toBe(`${hostname()}:pid-${process.pid}:${process.pid}:${hostInstance.GetBootID()}`);
    });

    it('keeps its identity, and logs, when another port is set after it was read', async () => {
        const hostInstance = await freshHostInstanceModule();
        hostInstance.SetHostInstancePort(4100);
        const before = hostInstance.GetHostInstanceID();

        hostInstance.SetHostInstancePort(4200);

        expect(hostInstance.GetHostInstanceID()).toBe(before);
        expect(logErrorMock).toHaveBeenCalledTimes(1);
        expect(String(logErrorMock.mock.calls[0][0])).toContain('Port 4200 was set after');
    });
});
