import { RequiresSubclass } from '@memberjunction/global';
import { ISandboxProvider, SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { HarnessSandboxSettings } from '../types.js';

/**
 * Base class for pluggable sandbox providers.
 *
 * Subclasses register with `@RegisterClass(BaseSandboxProvider, '<key>')` and are resolved from the
 * `sandbox.provider` field of an agent's `TypeConfiguration` through `MJGlobal.ClassFactory`, so a
 * deployment can add its own backend (Kubernetes, a remote runner, a vendor sandbox) without
 * forking this package — the same extension mechanism harness adapters and AI vendor drivers use.
 * Built-in keys: `local` (the default when unset), `docker`, and the experimental `openshell`.
 *
 * It implements {@link ISandboxProvider} rather than replacing it: the interface stays the stable
 * contract anything can satisfy, and this class adds the one thing a registry-resolved instance
 * needs that a constructor cannot give it — the agent's settings, which are only known after the
 * factory has already built the object.
 *
 * ## Lifecycle
 *
 * `ClassFactory.CreateInstance` runs the constructor with no arguments, so provider configuration
 * arrives afterwards through {@link Initialize}, which `HarnessAgentBase` calls exactly once,
 * before the first {@link Provision}. This mirrors how `BaseHarnessAdapter.SetExecutable` is applied
 * after resolution.
 *
 * `@RequiresSubclass()` marks the base as unusable on its own, so resolving an unregistered key
 * yields no instance rather than a hollow abstract object that would fail later and far from the
 * typo. Resolve with `ClassFactory.TryCreateInstance` and branch on `Resolved`.
 */
@RequiresSubclass()
export abstract class BaseSandboxProvider implements ISandboxProvider {
    /**
     * Applies the agent's `sandbox` settings. Called once, before {@link Provision}.
     *
     * The default is a no-op, for providers with nothing to configure. Implementations must
     * validate what they read — the settings come from hand-edited JSON — and throw on anything
     * that would be unsafe to use, so a typo fails the run visibly instead of weakening a sandbox.
     */
    public Initialize(_settings: HarnessSandboxSettings): void {
        // Default: nothing to configure.
    }

    /** @inheritdoc */
    public abstract Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle>;

    /** @inheritdoc */
    public abstract Finalize(handle: SandboxHandle, outcome: 'success' | 'failure' | 'cancelled'): Promise<void>;
}
