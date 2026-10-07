/**
 * @fileoverview AccessResolver — driver selection, session reuse, and the role boundary.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    AccessArtifact,
    AccessRequest,
    BaseAccessDriver,
    DEFAULT_ACCESS_ROLE,
} from '@memberjunction/content-pipeline-base';
import { AccessResolver } from '../AccessResolver.js';
import type { ResolvedSourceConfiguration } from '../ContentSourceConfigurationResolver.js';

const connects: AccessRequest[] = [];
let expiresAt: Date | undefined;

@RegisterClass(BaseAccessDriver, 'test-access')
class TestAccessDriver extends BaseAccessDriver {
    public readonly Key = 'test-access';
    public async Connect(request: AccessRequest): Promise<AccessArtifact> {
        connects.push(request);
        return { Headers: { Authorization: `Bearer ${request.Role}` }, ExpiresAt: expiresAt };
    }
}

@RegisterClass(BaseAccessDriver, 'test-access-failing')
class FailingAccessDriver extends BaseAccessDriver {
    public readonly Key = 'test-access-failing';
    public async Connect(): Promise<AccessArtifact> {
        throw new Error('the identity provider said no');
    }
}

function configuration(overrides: Record<string, unknown> = {}, type: Record<string, unknown> = {}) {
    return {
        ContentSourceID: 'S1',
        URL: 'https://x.test/',
        Settings: {},
        Parameters: {},
        Configuration: overrides,
        TypeConfiguration: type,
        DriverClass: null,
        DeclaredFields: [],
        Problems: [],
        IsValid: true,
    } as unknown as ResolvedSourceConfiguration;
}

const resolver = () => new AccessResolver({} as never, {} as never);

beforeEach(() => {
    connects.length = 0;
    expiresAt = undefined;
});

describe('which driver opens the session', () => {
    it('uses the Content Source Type’s driver', async () => {
        const artifact = await resolver().Artifact('S1', DEFAULT_ACCESS_ROLE, configuration({}, { AccessDriverKey: 'test-access' }));
        expect(artifact?.Headers?.Authorization).toBe('Bearer Default');
    });

    it('lets the source override its type', async () => {
        await resolver().Artifact(
            'S1',
            'Admin',
            configuration({ AccessDriverKey: 'test-access' }, { AccessDriverKey: 'test-access-failing' }),
        );
        expect(connects).toHaveLength(1);
    });

    it('returns null when the source needs no session at all', async () => {
        // A public website or a local directory. Not an error and not worth a warning.
        expect(await resolver().Artifact('S1', DEFAULT_ACCESS_ROLE, configuration())).toBeNull();
    });
});

describe('sessions are cached per source AND per role', () => {
    it('opens once however many records ask', async () => {
        const r = resolver();
        const config = configuration({}, { AccessDriverKey: 'test-access' });
        await Promise.all([
            r.Artifact('S1', DEFAULT_ACCESS_ROLE, config),
            r.Artifact('S1', DEFAULT_ACCESS_ROLE, config),
            r.Artifact('S1', DEFAULT_ACCESS_ROLE, config),
        ]);
        // The promise is cached, not the result, so concurrent callers share one exchange.
        expect(connects).toHaveLength(1);
    });

    it('does NOT hand one role the session opened for another', async () => {
        const r = resolver();
        const config = configuration({}, { AccessDriverKey: 'test-access' });
        const asDefault = await r.Artifact('S1', DEFAULT_ACCESS_ROLE, config);
        const asAdmin = await r.Artifact('S1', 'Admin', config);
        expect(asDefault?.Headers?.Authorization).toBe('Bearer Default');
        expect(asAdmin?.Headers?.Authorization).toBe('Bearer Admin');
        expect(connects).toHaveLength(2);
    });

    it('re-opens an expired session rather than handing back a dead one', async () => {
        const r = resolver();
        const config = configuration({}, { AccessDriverKey: 'test-access' });
        expiresAt = new Date(Date.now() - 1000);
        await r.Artifact('S1', DEFAULT_ACCESS_ROLE, config);
        await r.Artifact('S1', DEFAULT_ACCESS_ROLE, config);
        expect(connects).toHaveLength(2);
    });

    it('does not cache a failed exchange, so one outage does not poison the run', async () => {
        const r = resolver();
        const config = configuration({}, { AccessDriverKey: 'test-access-failing' });
        await expect(r.Artifact('S1', DEFAULT_ACCESS_ROLE, config)).rejects.toThrow();
        await expect(r.Artifact('S1', DEFAULT_ACCESS_ROLE, config)).rejects.toThrow();
    });
});

describe('connectivity can be tested without running a stage', () => {
    it('reports success and when the session expires', async () => {
        expiresAt = new Date(Date.now() + 60_000);
        const probe = await new AccessResolver({} as never, {} as never, {
            Resolve: async () => configuration({}, { AccessDriverKey: 'test-access' }),
        } as never).Probe('S1');
        expect(probe.Success).toBe(true);
        expect(probe.DriverKey).toBe('test-access');
        expect(probe.ExpiresAt).toEqual(expiresAt);
    });

    it('reports the reason rather than throwing, so a config screen can show it', async () => {
        const probe = await new AccessResolver({} as never, {} as never, {
            Resolve: async () => configuration({}, { AccessDriverKey: 'test-access-failing' }),
        } as never).Probe('S1');
        expect(probe.Success).toBe(false);
        expect(probe.Message).toContain('the identity provider said no');
    });

    it('passes a source that needs no driver', async () => {
        const probe = await new AccessResolver({} as never, {} as never, {
            Resolve: async () => configuration(),
        } as never).Probe('S1');
        expect(probe.Success).toBe(true);
    });

    it('names an unregistered driver instead of failing obscurely later', async () => {
        const probe = await new AccessResolver({} as never, {} as never, {
            Resolve: async () => configuration({}, { AccessDriverKey: 'nope' }),
        } as never).Probe('S1');
        expect(probe.Success).toBe(false);
        expect(probe.Message).toContain('not registered');
    });
});
