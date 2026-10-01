/**
 * Pins how `sandbox.provider` resolves to a provider through the class factory.
 *
 * The behaviour being replaced was `provider === 'docker' ? Docker : Local` — a closed set no
 * deployment could extend. Providers now register under `BaseSandboxProvider`, and the two failure
 * modes that matter are tested explicitly: an unknown key must be an ERROR (CreateInstance would hand
 * back the abstract base), and settings must reach the provider through Initialize.
 */
import { describe, it, expect, vi } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    BaseSandboxProvider,
    DockerSandboxProvider,
    HarnessAgentBase,
    HarnessSandboxSettings,
    ISandboxProvider,
    LoadAgentHarnessSandboxProviders,
    LocalDirectorySandboxProvider,
    OpenShellSandboxProvider,
    SandboxConfig,
    SandboxHandle,
    WorkspaceKey,
} from '../index';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

function create(sandbox?: HarnessSandboxSettings): ISandboxProvider {
    const agent = new HarnessAgentBase();
    return (agent as unknown as { createSandboxProvider(c: { sandbox?: HarnessSandboxSettings }): ISandboxProvider }).createSandboxProvider({ sandbox });
}

describe('sandbox provider registry', () => {
    it('defaults to the local provider when sandbox.provider is unset', () => {
        expect(create()).toBeInstanceOf(LocalDirectorySandboxProvider);
        expect(create({})).toBeInstanceOf(LocalDirectorySandboxProvider);
    });

    it.each([
        ['local', LocalDirectorySandboxProvider],
        ['docker', DockerSandboxProvider],
        ['openshell', OpenShellSandboxProvider],
    ])('resolves %s', (provider, expected) => {
        expect(create({ provider })).toBeInstanceOf(expected);
    });

    it('matches keys case-insensitively and ignores surrounding whitespace', () => {
        expect(create({ provider: ' Docker ' })).toBeInstanceOf(DockerSandboxProvider);
    });

    it('registers every built-in under BaseSandboxProvider', () => {
        const keys = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseSandboxProvider).map((r) => r.Key);
        expect(keys).toEqual(expect.arrayContaining(['local', 'docker', 'openshell']));
    });

    it('throws a clear error for an unknown key, listing what is registered', () => {
        expect(() => create({ provider: 'kubernetes' })).toThrow(/Unknown sandbox provider 'kubernetes'.*docker.*local.*openshell/);
    });

    it('does NOT fall back to the abstract base for an unknown key', () => {
        // CreateInstance would return a hollow BaseSandboxProvider here; the resolver must not.
        expect(() => create({ provider: 'nope' })).toThrow();
    });

    it('hands the whole sandbox block to Initialize, exactly once', () => {
        const initialize = vi.spyOn(DockerSandboxProvider.prototype, 'Initialize');
        const settings: HarnessSandboxSettings = { provider: 'docker', image: 'x/y:1', limits: { memory: '1g' } };
        create(settings);
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(initialize).toHaveBeenCalledWith(settings);
        initialize.mockRestore();
    });

    it('surfaces a settings error from Initialize instead of constructing a weakened sandbox', () => {
        expect(() => create({ provider: 'docker', limits: { memory: 'oops' } })).toThrow(/memory/);
    });

    it('lets a deployment add its own provider without forking', () => {
        @RegisterClass(BaseSandboxProvider, 'test-custom')
        class CustomProvider extends BaseSandboxProvider {
            public Settings?: HarnessSandboxSettings;
            public override Initialize(settings: HarnessSandboxSettings): void {
                this.Settings = settings;
            }
            public async Provision(_key: WorkspaceKey, _config: SandboxConfig): Promise<SandboxHandle> {
                throw new Error('not used');
            }
            public async Finalize(): Promise<void> {}
        }
        const provider = create({ provider: 'test-custom', image: 'z' });
        expect(provider).toBeInstanceOf(CustomProvider);
        expect((provider as CustomProvider).Settings?.image).toBe('z');
    });

    it('exposes the tree-shaking guard', () => {
        expect(() => LoadAgentHarnessSandboxProviders()).not.toThrow();
    });
});
