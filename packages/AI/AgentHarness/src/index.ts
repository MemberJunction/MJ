export * from './types.js';
export * from './adapters/BaseHarnessAdapter.js';
export * from './adapters/BaseCliHarnessAdapter.js';
export * from './adapters/StdioJsonAdapter.js';
export * from './adapters/CodexAdapter.js';
export * from './adapters/OpenCodeAdapter.js';
export * from './adapters/GeminiCliAdapter.js';
export * from './adapters/PiAdapter.js';
export * from './sandbox/ISandboxProvider.js';
export * from './sandbox/LocalDirectorySandboxProvider.js';

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
