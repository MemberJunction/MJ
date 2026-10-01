export * from './types.js';
export * from './CredentialSecret.js';
export * from './HarnessAgentType.js';
export * from './HarnessAgentBase.js';
export * from './adapters/BaseHarnessAdapter.js';
export * from './adapters/BaseCliHarnessAdapter.js';
export * from './adapters/StdioJsonAdapter.js';
export * from './adapters/ClaudeCodeCliAdapter.js';
export * from './adapters/CodexAdapter.js';
export * from './adapters/OpenCodeAdapter.js';
export * from './adapters/GeminiCliAdapter.js';
export * from './adapters/PiAdapter.js';
export * from './sandbox/SandboxExecutor.js';
export * from './sandbox/ISandboxProvider.js';
export * from './sandbox/BaseSandboxProvider.js';
export * from './sandbox/HostEnvironment.js';
export * from './sandbox/ChildProcessExecutor.js';
export * from './sandbox/DockerSandboxProvider.js';
export * from './sandbox/LocalDirectorySandboxProvider.js';
export * from './sandbox/OpenShellSandboxProvider.js';

/**
 * Tree-shaking guard.
 *
 * The adapters register themselves with ClassFactory via `@RegisterClass` as a side effect of being
 * loaded. A bundler that sees no direct import of a module is free to drop it, which would leave
 * `AIAgentHarness.DriverClass` resolving to nothing at runtime — a failure that only appears in a
 * built artifact, never in dev. Calling this from a consumer's startup path keeps them reachable.
 */
export function LoadAgentHarnessAdapters(): void {
    // Intentionally empty — the imports above are the point.
}

/**
 * Tree-shaking guard for sandbox providers.
 *
 * `LocalDirectorySandboxProvider`, `DockerSandboxProvider` and `OpenShellSandboxProvider` register
 * with `ClassFactory` under `BaseSandboxProvider` as a side effect of being loaded, and
 * `sandbox.provider` in an agent's `TypeConfiguration` resolves through that registry. As with the
 * adapters, a bundler that sees no direct import is free to drop the modules, leaving a configured
 * provider resolving to nothing in a built artifact. Call this from a consumer's startup path.
 */
export function LoadAgentHarnessSandboxProviders(): void {
    // Intentionally empty — the imports above are the point.
}
